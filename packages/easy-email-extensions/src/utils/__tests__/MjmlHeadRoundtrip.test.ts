import { JsonToMjml } from 'easy-email-core';
import mjml from 'mjml-browser';
import { MjmlToJson } from '../MjmlToJson';

// A theme as Mautic ships it: own head, no Easy Email metadata yet.
const themeMjml = `<mjml>
<mj-head>
  <mj-title>{subject}</mj-title>
  <mj-preview>Vorschautext f&uuml;r den Posteingang</mj-preview>
  <mj-font name="Inter" href="https://fonts.googleapis.com/css2?family=Inter" />
  <mj-attributes>
    <mj-all font-family="Inter, Arial, sans-serif" />
    <mj-text font-size="16px" line-height="1.5" color="#111111" />
    <mj-button border-radius="3px" />
  </mj-attributes>
</mj-head>
<mj-body background-color="#003740">
  <mj-section><mj-column><mj-text>Hallo</mj-text></mj-column></mj-section>
</mj-body>
</mjml>`;

const roundTrip = (text: string) => {
  const json = MjmlToJson(mjml(text, { validationLevel: 'soft' }).json);
  return JsonToMjml({ data: json, mode: 'production', context: json });
};

const headOf = (text: string) => text.match(/<mj-head>[\s\S]*<\/mj-head>/)![0];

describe('Head of an imported template', () => {
  const first = roundTrip(themeMjml);

  it('keeps mj-title and mj-preview', () => {
    expect(first).toContain('<mj-title>{subject}</mj-title>');
    expect(first).toMatch(/<mj-preview>Vorschautext f(ü|&uuml;)r den Posteingang<\/mj-preview>/);
  });

  it('keeps the theme defaults instead of the editor defaults', () => {
    expect(first).not.toContain('-apple-system');
    expect(first).not.toContain('font-size="14px"');
    expect(first).toContain('<mj-all font-family="Inter, Arial, sans-serif"></mj-all>');
    expect(first).toContain('<mj-text font-size="16px"></mj-text>');
    expect(first).toContain('<mj-button border-radius="3px"></mj-button>');
    expect(first).not.toContain('<mj-text font-weight=');
  });

  it('adds no editor default on a later save either', () => {
    expect(roundTrip(roundTrip(first))).not.toContain('<mj-text font-weight=');
  });

  it('writes no self-closing mj-* tags in the head', () => {
    expect(headOf(first)).not.toMatch(/<mj-[a-z-]+[^>]*\/>/);
  });

  it('is stable when saved again', () => {
    expect(headOf(roundTrip(first))).toEqual(headOf(first));
  });

  it('renders the same text styles as the theme', () => {
    const theme = mjml(themeMjml).html;
    const saved = mjml(first).html;
    const style = (html: string) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const hits = [...doc.querySelectorAll('div')].filter((d) => d.textContent?.trim() === 'Hallo');
      return hits[hits.length - 1]?.getAttribute('style');
    };
    expect(style(theme)).toContain('font-size:16px');
    expect(style(saved)).toEqual(style(theme));
  });
});
