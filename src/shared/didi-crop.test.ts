import { describe, expect, it } from 'vitest';
import { detectDidiFooterCrop } from './didi-crop';

describe('Didi footer cropping', () => {
  const page = { left: 0, bottom: 0, right: 595.28, top: 841.89 };
  const marker = [{ text: 'didi', x: 13, y: 419, width: 19, height: 11 }];

  it('removes only the area below a standalone Didi footer marker on taxi invoices', () => {
    expect(detectDidiFooterCrop(marker, page, 'taxi')).toEqual({
      xPt: 0,
      yPt: 407,
      widthPt: page.right,
      heightPt: page.top - 407,
      reason: 'didi_footer',
    });
  });

  it('uses the source visible box when the marker sits just outside its text layer', () => {
    const croppedPage = { left: 0, bottom: 432.88, right: 595.28, top: 841.89 };
    expect(detectDidiFooterCrop([], croppedPage, 'taxi', true)).toEqual({
      xPt: 0,
      yPt: 407.88,
      widthPt: 595.28,
      heightPt: 434.01,
      reason: 'didi_footer',
    });
  });

  it('does not crop other categories or non-standalone text', () => {
    expect(detectDidiFooterCrop(marker, page, 'other')).toBeUndefined();
    expect(
      detectDidiFooterCrop([{ ...marker[0], text: 'didi electronic invoice' }], page, 'taxi'),
    ).toBeUndefined();
  });
});
