#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';
import * as lib from './lib.mjs';

// 여러 프로젝트의 피드백이 한 보관함에 모이므로, 설정·세션은 개발자 홈 한곳에 둡니다.
const ROOT = process.env.CONFIDBACK_HOME ?? path.join(os.homedir(), '.confidback');
const CONFIG = path.join(ROOT, 'config.json');
const MODELS = path.join(os.homedir(), '.cache', 'confidback');
const AGENTS = { codex: 'Codex', claude: 'Claude Code' };
const HF = 'https://huggingface.co';
const VAD = 'ggml-silero-v6.2.0.bin';
const MLX_MODEL = 'mlx-community/whisper-large-v3-turbo';

const die = (msg) => { console.error(`\n✗ ${msg}`); process.exit(1); };
const short = (p) => p.replace(os.homedir(), '~');
const has = (bin) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin]).status === 0;
// shortcut: Windows의 npm .cmd 실행 파일은 shell 없이 못 부름, Windows 네이티브 지원 때 처리 추가 (지금은 WSL 권장)
const sh = (bin, args, opts = {}) => {
  const r = spawnSync(bin, args, { stdio: 'inherit', ...opts });
  if (r.error?.code === 'ENOENT') die(`${bin} 이(가) 설치돼 있지 않습니다. confidback init 안내를 확인해 주세요.`);
  if (r.status !== 0) die(`${bin} 실행에 실패했습니다.`);
  return r;
};
const loadConfig = () => {
  if (!fs.existsSync(CONFIG)) die('먼저 confidback init 을 실행해 주세요.');
  return JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
};
const saveConfig = (cfg) => {
  fs.mkdirSync(ROOT, { recursive: true });
  fs.writeFileSync(CONFIG, `${JSON.stringify(cfg, null, 2)}\n`);
  fs.chmodSync(CONFIG, 0o600); // 개발자 키가 들어 있으므로 본인만 읽게 합니다.
};

// 질문 도우미. 답을 파이프로 넘기면(예: AI 에이전트가 대신 실행) readline이 질문 전에 온 줄을 버리므로 한 번에 읽어 차례로 씁니다.
function prompter() {
  const piped = !process.stdin.isTTY && fs.readFileSync(0, 'utf8').split('\n');
  const rl = piped ? null : readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q, def = '', secret = false) => {
    const prompt = `${q}${def ? ` [${def}]` : ''}: `;
    const echo = (a) => (secret && a ? '(입력됨)' : a);
    const a = piped ? (console.log(prompt + echo(piped[0] ?? '')), piped.shift() ?? '') : await rl.question(prompt);
    return a.trim() || def;
  };
  return { ask, close: () => rl?.close() };
}

async function download(url, dest, headers) {
  if (fs.existsSync(dest)) return;
  const res = await fetch(url, { headers });
  if (!res.ok) die(`내려받기 실패 (${res.status}): ${url}`);
  const mb = Math.round(Number(res.headers.get('content-length')) / 2 ** 20);
  console.log(`  내려받는 중: ${path.basename(dest)} (약 ${mb}MB)`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // 중간에 끊겨도 깨진 파일이 남지 않도록 임시 파일에 받은 뒤 이름을 바꿉니다.
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(`${dest}.part`));
  fs.renameSync(`${dest}.part`, dest);
}

async function init(preset = {}) {
  const installed = Object.keys(AGENTS).filter(has);
  if (!installed.length) die('Codex 또는 Claude Code CLI가 필요합니다.');
  const { ask, close } = prompter();
  const choose = async (q, def) => {
    let a;
    while (!installed.includes((a = await ask(`${q} (${installed.join(' / ')})`, def))));
    return a;
  };
  const prev = fs.existsSync(CONFIG) ? JSON.parse(fs.readFileSync(CONFIG, 'utf8')) : {};

  console.log(`설치된 AI: ${installed.map((k) => AGENTS[k]).join(', ')}\n`);
  const fixer = await choose('수정 작업에 쓰는 AI', installed.includes('claude') ? 'claude' : installed[0]);
  const summarizer = await choose('피드백 정리에 쓰는 AI', installed.includes('codex') ? 'codex' : fixer);
  const mailTo = await ask('메일 받는 사람 (선택)');
  const glossary = await ask('자주 나오는 단어 — 앱 이름, 화면 이름 등을 쉼표로 (선택)');
  // 시작 페이지의 한 줄 명령은 --server, --key 로 보관함 연결을 미리 채웁니다.
  const server = (preset.server ?? await ask('보관함 주소 — 의뢰자 녹화를 서버로 받을 때 (선택, 예: https://confidback.<계정>.workers.dev)')).replace(/\/+$/, '');
  const devKey = preset.key ?? (server ? await ask('보관함 개발자 키', '', true) : '');

  // Apple Silicon은 mlx_whisper가 더 빠릅니다. 가상환경 안의 실행 파일 경로를 저장해 두면 활성화 없이 씁니다.
  let mlxWhisper = '';
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    const found = spawnSync('which', ['mlx_whisper'], { encoding: 'utf8' }).stdout.trim();
    mlxWhisper = (await ask('mlx_whisper 경로 (예: ~/ai-lab/mlx/.venv/bin/mlx_whisper, 비우면 whisper.cpp)', found))
      .replace(/^~(?=\/)/, os.homedir());
    if (mlxWhisper && !fs.existsSync(mlxWhisper)) {
      console.log(`! ${mlxWhisper} 이(가) 없어 whisper.cpp 를 씁니다.`);
      mlxWhisper = '';
    }
  }

  const model = lib.pickWhisperModel({ platform: process.platform, arch: process.arch, totalmem: os.totalmem() });
  const config = {
    summarizer, fixer, mailTo, glossary, mlxWhisper, server, devKey,
    whisperModel: path.join(MODELS, model),
    vadModel: path.join(MODELS, VAD),
    projects: prev.projects ?? [],
  };

  const missing = ['ffmpeg', ...(mlxWhisper ? [] : ['whisper-cli'])].filter((b) => !has(b));
  if (missing.length) {
    console.log(`\n! 아직 없는 프로그램: ${missing.join(', ')}`);
    console.log(process.platform === 'darwin'
      ? '  설치: brew install whisper.cpp ffmpeg'
      : '  설치: ffmpeg 공식 배포판 + https://github.com/ggml-org/whisper.cpp/releases 를 받아 PATH에 추가');
  }
  if (!mlxWhisper && !fs.existsSync(config.whisperModel) &&
      /^y/i.test(await ask(`\n받아쓰기 모델 ${model} 을(를) 지금 내려받을까요? (Y/n)`, 'Y'))) {
    await download(`${HF}/ggerganov/whisper.cpp/resolve/main/${model}`, config.whisperModel);
    await download(`${HF}/ggml-org/whisper-vad/resolve/main/${VAD}`, config.vadModel);
  }
  close();
  saveConfig(config);
  console.log(`\n✓ 설정 저장: ${short(CONFIG)} (정리: ${AGENTS[summarizer]}, 수정: ${AGENTS[fixer]})`);
}

function summarize(agent, prompt, images, out, cwd) {
  console.log(`\n${AGENTS[agent]}(으)로 피드백을 정리합니다…`);
  if (agent === 'codex') {
    // -i 는 여러 값을 받으므로 프롬프트는 stdin 으로 넘깁니다.
    sh('codex', ['exec', '-s', 'read-only', '--skip-git-repo-check', '-o', out, ...images.flatMap((f) => ['-i', f])],
      { cwd, input: prompt, stdio: ['pipe', 'ignore', 'inherit'] });
  } else {
    const r = sh('claude', ['-p', '--allowedTools', 'Read'],
      { cwd, input: prompt, stdio: ['pipe', 'pipe', 'inherit'], maxBuffer: 64 * 2 ** 20 });
    fs.writeFileSync(out, r.stdout);
  }
}

function openUrl(url) {
  const [bin, args] = { darwin: ['open', [url]], win32: ['rundll32', ['url.dll,FileProtocolHandler', url]] }[process.platform]
    ?? ['xdg-open', [url]];
  spawnSync(bin, args);
}
const mailto = (to, { subject, body }) =>
  `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

// FEEDBACK.md가 있는 세션 이름, 최신순
const listSessions = () => !fs.existsSync(ROOT) ? [] : fs.readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(ROOT, d.name, 'FEEDBACK.md')))
  .map((d) => ({ name: d.name, time: fs.statSync(path.join(ROOT, d.name, 'FEEDBACK.md')).mtimeMs }))
  .sort((a, b) => b.time - a.time);
const readJson = (f) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;

async function run(video) {
  const cfg = loadConfig();
  if (!video || !fs.existsSync(video)) die('사용법: confidback run <녹화 파일>');
  const dir = path.join(ROOT, path.parse(video).name);
  fs.rmSync(path.join(dir, 'frames'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'frames'), { recursive: true });

  // 애매한 부분을 원본으로 확인하도록 세션에 보관합니다. 크롬 녹화(webm)는 길이 정보가 없어
  // 시점 이동이 안 되므로 -c copy 로 다시 담아 채웁니다.
  // shortcut: .mov는 브라우저에 따라 재생이 안 될 수 있음, 문제가 되면 mp4로 다시 담는다
  const original = path.join(dir, `original${path.extname(video).toLowerCase()}`);
  sh('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-c', 'copy', original]);
  video = original;

  console.log('1/3 받아쓰기…');
  const wav = path.join(dir, 'audio.wav');
  sh('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav]);
  const vol = spawnSync('ffmpeg', ['-i', wav, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  // 말소리는 보통 -30dB보다 크고, 꺼진 마이크는 -60dB 아래입니다.
  if (!(lib.parseMaxVolume(vol) > -45)) die('녹화에 소리가 거의 없습니다. 의뢰자 마이크가 꺼져 있었는지 확인하고 다시 녹화해 주세요.');
  if (cfg.mlxWhisper) {
    // VAD가 없으므로 이전 문장 이어 쓰기를 끄고, 긴 침묵 속 환각 구간을 건너뜁니다.
    const margs = [wav, '--model', MLX_MODEL, '--language', 'ko', '--output-dir', dir, '--output-name', 'transcript',
      '--output-format', 'json', '--verbose', 'False', '--condition-on-previous-text', 'False',
      '--word-timestamps', 'True', '--hallucination-silence-threshold', '2'];
    if (cfg.glossary) margs.push('--initial-prompt', cfg.glossary);
    sh(cfg.mlxWhisper, margs, { stdio: ['ignore', 'ignore', 'inherit'] });
  } else {
    const wargs = ['-m', cfg.whisperModel, '-f', wav, '-l', 'ko', '--vad', '-vm', cfg.vadModel, '-oj', '-of', path.join(dir, 'transcript'), '-np'];
    if (cfg.glossary) wargs.push('--prompt', cfg.glossary);
    sh('whisper-cli', wargs, { stdio: ['ignore', 'ignore', 'inherit'] });
  }
  const segments = lib.parseWhisperJson(JSON.parse(fs.readFileSync(path.join(dir, 'transcript.json'), 'utf8')));
  if (!segments.length) die('말소리를 찾지 못했습니다. 녹화할 때 마이크가 켜져 있었는지 확인해 주세요.');

  console.log('2/3 화면 캡처…');
  const picks = lib.pickMoments(segments);
  sh('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-vf', lib.selectExpr(picks), '-fps_mode', 'vfr', '-q:v', '3',
    path.join(dir, 'frames', '%03d.jpg')]);
  const frames = picks.map((ms, i) => ({ ms, file: lib.frameFile(ms), tmp: path.join(dir, 'frames', `${String(i + 1).padStart(3, '0')}.jpg`) }))
    .filter((f) => fs.existsSync(f.tmp));
  for (const f of frames) fs.renameSync(f.tmp, path.join(dir, f.file));

  console.log('3/3 정리…');
  // 정리 AI는 세션 폴더 안에서 돌려 캡처를 상대 경로로 읽게 합니다.
  const prompt = lib.buildSummaryPrompt({ segments, frames, dir: '.' });
  fs.writeFileSync(path.join(dir, 'prompt.md'), prompt);
  const out = path.join(dir, 'FEEDBACK.md');
  summarize(cfg.summarizer, prompt, frames.map((f) => path.join(dir, f.file)), out, dir);

  const name = path.basename(dir);
  console.log(`\n✓ ${short(out)}`);
  console.log('  한눈에 보기: confidback dashboard');
  console.log(`  수정 시작:   confidback fix ${name}   (프로젝트를 고르면 AI가 인터뷰로 시작합니다)`);
  const email = lib.extractEmail(fs.readFileSync(out, 'utf8'));
  if (email && process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (/^y/i.test(await rl.question('메일 앱에서 초안을 열까요? (y/N): '))) openUrl(mailto(cfg.mailTo, email));
    rl.close();
  }
}

// 보관함에서 아직 정리하지 않은 녹화를 받아 이 컴퓨터에서(mlx_whisper + 구독 AI) 정리합니다.
async function pull() {
  const cfg = loadConfig();
  if (!cfg.server) die('보관함 주소가 없습니다. confidback init 에서 보관함 주소와 개발자 키를 넣어 주세요.');
  const headers = { Authorization: `Bearer ${cfg.devKey}` };
  const res = await fetch(`${cfg.server}/api/list`, { headers }).catch(() => die(`보관함에 연결하지 못했습니다: ${cfg.server}`));
  if (!res.ok) die(`보관함 조회 실패 (${res.status}). 주소와 개발자 키를 확인해 주세요.`);
  const fresh = (await res.json()).filter((r) => !r.checkedAt && !fs.existsSync(path.join(ROOT, r.name, 'FEEDBACK.md')));
  if (!fresh.length) return console.log('새 녹화가 없습니다.');
  console.log(`새 녹화 ${fresh.length}건을 받아 정리합니다.`);
  for (const r of fresh) {
    const file = path.join(ROOT, 'inbox', path.basename(r.key));
    await download(`${cfg.server}/api/file?key=${encodeURIComponent(r.key)}`, file, headers);
    await run(file);
    fs.rmSync(file); // 원본은 세션 폴더에 보관했으므로 받은 파일은 지웁니다.
  }
}

// 개선을 마친 녹화를 체크합니다. 보관함의 원본은 체크 24시간 뒤 서버가 지웁니다.
async function done(name) {
  const cfg = loadConfig();
  const pick = name ?? listSessions()[0]?.name;
  if (!pick || !fs.existsSync(path.join(ROOT, pick, 'FEEDBACK.md'))) die(`정리된 피드백이 없습니다: ${pick ?? '(없음)'}`);
  let deleteAfter = null;
  if (cfg.server) {
    const res = await fetch(`${cfg.server}/api/done?name=${encodeURIComponent(pick)}`, { method: 'POST', headers: { Authorization: `Bearer ${cfg.devKey}` } })
      .catch(() => die(`보관함에 연결하지 못했습니다: ${cfg.server}`));
    if (res.status === 404) console.log('보관함에 없는 녹화입니다(파일로 받은 녹화). 이 컴퓨터에만 완료로 표시합니다.');
    else if (!res.ok) die(`체크하지 못했습니다 (${res.status}).`);
    else ({ deleteAfter } = await res.json());
  }
  fs.writeFileSync(path.join(ROOT, pick, 'done.json'), `${JSON.stringify({ checkedAt: new Date(), deleteAfter })}\n`);
  console.log(`✓ ${pick} 개선 완료${deleteAfter ? ` — 보관함 원본은 ${new Date(deleteAfter).toLocaleString('ko-KR')} 이후 지워집니다.` : ''}`);
}

function dashboard() {
  const cfg = loadConfig();
  const sessions = listSessions().map(({ name, time }) => {
    const dir = path.join(ROOT, name);
    const md = fs.readFileSync(path.join(dir, 'FEEDBACK.md'), 'utf8');
    const tj = path.join(dir, 'transcript.json');
    const transcript = fs.existsSync(tj)
      ? lib.parseWhisperJson(JSON.parse(fs.readFileSync(tj, 'utf8'))).map((s) => [lib.fmt(s.from), s.text])
      : [];
    const fb = lib.parseFeedback(md);
    const original = fs.readdirSync(dir).find((f) => f.startsWith('original.'));
    return { name, time, md, transcript, ...fb, mailto: fb.email && mailto(cfg.mailTo, fb.email),
      video: original && `${encodeURIComponent(name)}/${original}`,
      done: readJson(path.join(dir, 'done.json')),
      project: readJson(path.join(dir, 'project.json'))?.path ?? null };
  });
  const tpl = fs.readFileSync(new URL('./dashboard.html', import.meta.url), 'utf8');
  const out = path.join(ROOT, 'dashboard.html');
  // 함수로 치환해야 데이터 속 $& 같은 문자열이 치환 패턴으로 해석되지 않습니다.
  fs.writeFileSync(out, tpl.replace('__DATA__', () => lib.embedJson({ fixer: cfg.fixer, sessions })));
  console.log(`✓ ${short(out)} (세션 ${sessions.length}개)`);
  openUrl(out);
}

// 이 피드백이 어느 프로젝트인지 고릅니다. 한 번 고른 프로젝트는 목록에 남습니다.
async function chooseProject(cfg, appUrl) {
  const projects = cfg.projects ?? [];
  console.log(`\n이 피드백은 어느 프로젝트인가요?${appUrl ? `  (녹화 속 앱 주소: ${appUrl})` : ''}`);
  projects.forEach((p, i) => console.log(`  ${i + 1}. ${path.basename(p)}   ${short(p)}`));
  console.log(`  ${projects.length + 1}. 다른 폴더 (경로 입력)`);
  const { ask, close } = prompter();
  const here = projects.indexOf(process.cwd()) + 1;
  const n = Number(await ask('번호', String(here || projects.length + 1)));
  const picked = projects[n - 1]
    ?? path.resolve((await ask('프로젝트 폴더 경로', process.cwd())).replace(/^~(?=\/)/, os.homedir()));
  close();
  if (!fs.statSync(picked, { throwIfNoEntry: false })?.isDirectory()) die(`폴더가 없습니다: ${picked}`);
  if (!projects.includes(picked)) saveConfig({ ...cfg, projects: [...projects, picked] });
  return picked;
}

async function fix(name, agent) {
  const cfg = loadConfig();
  agent ??= cfg.fixer;
  if (!AGENTS[agent]) die(`--with 에는 ${Object.keys(AGENTS).join(' / ')} 중 하나를 넣어 주세요.`);
  const sessions = listSessions().map((s) => s.name);
  const pick = name ?? sessions[0];
  if (!sessions.includes(pick)) die(`정리된 피드백이 없습니다: ${pick ?? '(없음)'}. 먼저 confidback pull 이나 run 을 실행해 주세요.`);
  const dir = path.join(ROOT, pick);
  const fb = path.join(dir, 'FEEDBACK.md');
  const metaFile = path.join(dir, 'project.json');
  let project = readJson(metaFile)?.path;
  if (!project) {
    project = await chooseProject(cfg, lib.parseFeedback(fs.readFileSync(fb, 'utf8')).appUrl);
    fs.writeFileSync(metaFile, `${JSON.stringify({ path: project })}\n`);
  }
  console.log(`\n${AGENTS[agent]}이(가) ${short(project)} 에서 피드백 인터뷰를 시작합니다.\n`);
  // Claude Code는 작업 폴더 밖의 피드백 폴더를 읽도록 --add-dir 로 열어 줍니다.
  const args = [...(agent === 'claude' ? ['--add-dir', dir] : []), lib.fixPrompt(fb, pick)];
  spawnSync(agent, args, { cwd: project, stdio: 'inherit' });
}

const { positionals, values } = parseArgs({ allowPositionals: true,
  options: { with: { type: 'string' }, server: { type: 'string' }, key: { type: 'string' } } });
const [cmd, arg] = positionals;
if (cmd === 'init') await init({ server: values.server, key: values.key });
else if (cmd === 'run') await run(arg);
else if (cmd === 'pull') await pull();
else if (cmd === 'dashboard') dashboard();
else if (cmd === 'fix') await fix(arg, values.with);
else if (cmd === 'done') await done(arg);
else console.log(`confidback — 의뢰자의 화면·음성 피드백을 정리해 코딩 AI에게 넘깁니다. (보관 위치: ${short(ROOT)})

  confidback init               쓰는 AI 고르기, 받아쓰기 모델 준비, 보관함 연결 (개발자마다 한 번)
  confidback pull               보관함에 쌓인 새 녹화를 받아 정리
  confidback run <녹화 파일>     파일로 받은 녹화를 정리 (받아쓰기 → 화면 캡처 → FEEDBACK.md)
  confidback dashboard          모든 프로젝트의 피드백을 화면 캡처·원본과 함께 보기
  confidback fix [세션] [--with codex|claude]   프로젝트를 고르고 AI가 인터뷰 형식으로 개선 시작
  confidback done [세션]         개선 완료 체크 (보관함 원본은 24시간 뒤 삭제)`);
