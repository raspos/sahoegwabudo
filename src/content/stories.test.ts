import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Dataset } from '../data/engine';
import type { Extras } from '../data/extras';
import { STORY_REGIONS, type StoryDoc } from './storyStore';
import { auditMarkdown, auditStories } from './storyAudit';

const load = (f: string) => JSON.parse(readFileSync(resolve(__dirname, '../../public/data', f), 'utf-8'));
const ds = new Dataset(load('countries.json'), load('indicators.json'), load('observations.json'));
const ex: Extras = { trade: load('trade.json'), agri: load('agri.json'), nature: load('nature.json'), specialties: load('specialties.json') };
const docs: StoryDoc[] = STORY_REGIONS.flatMap((r) => { try { return load(`stories/${r}.json`); } catch { return []; } });
const audit = auditStories(docs, ds, ex);

// 감사 보고서를 남긴다 (docs/story-audit.md)
mkdirSync(resolve(__dirname, '../../docs'), { recursive: true });
writeFileSync(resolve(__dirname, '../../docs/story-audit.md'), auditMarkdown(audit, ds), 'utf-8');

describe('나라 이야기 콘텐츠 검사', () => {
  it('구조 오류가 없다 (국가 코드·지표·통계 토큰·ID·제목·출처·장면 수·질문형 제목·미완성 문구)', () => {
    const hard = audit.issues.filter((x) => x.kind !== '내용 유사');
    expect(hard, JSON.stringify(hard.slice(0, 10), null, 1)).toEqual([]);
  });
  it('나라 이름·숫자만 바꾼 비슷한 이야기가 없다', () => {
    const sim = audit.issues.filter((x) => x.kind === '내용 유사');
    expect(sim, JSON.stringify(sim.slice(0, 10))).toEqual([]);
  });
  it('전체 국가 195개', () => {
    expect(audit.countries).toBe(195);
  });
});
