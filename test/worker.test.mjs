import assert from 'node:assert/strict';
import test from 'node:test';
import { expired } from '../server/worker.js';
import { fixPrompt } from '../cli/lib.mjs';

test('체크한 지 24시간이 지난 원본만 삭제 대상이 된다', () => {
  const H = 3600 * 1000, now = Date.parse('2026-11-10T12:00:00Z');
  const markers = [
    { key: 'done/a', uploaded: new Date(now - 25 * H) },
    { key: 'done/b', uploaded: new Date(now - 24 * H) },
    { key: 'done/c', uploaded: new Date(now - 23 * H) },
  ];
  assert.deepEqual(expired(markers, now, 24 * H).map((m) => m.key), ['done/a', 'done/b']);
});

test('수정 지시문은 인터뷰로 시작하고 완료 체크 명령을 담는다', () => {
  const p = fixPrompt('/x/FEEDBACK.md', '20261109T065535-a7e0b79f');
  assert.match(p, /인터뷰/);
  assert.match(p, /진행할까요, 바꿀까요, 건너뛸까요/);
  assert.match(p, /confidback done 20261109T065535-a7e0b79f/);
});
