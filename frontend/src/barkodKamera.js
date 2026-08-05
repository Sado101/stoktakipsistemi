import { BrowserMultiFormatOneDReader } from '@zxing/browser';
import { DecodeHintType } from '@zxing/library';

export const BARKOD_KAMERA_KISITLARI = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
  },
};

function androidMi() {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

export function barkodOkuyucuOlustur() {
  const hints = new Map();
  if (androidMi()) hints.set(DecodeHintType.TRY_HARDER, true);

  return new BrowserMultiFormatOneDReader(hints, {
    delayBetweenScanAttempts: androidMi() ? 80 : 60,
    delayBetweenScanSuccess: 300,
  });
}

export async function kameraOdaklamasiniIyilestir(videoElement) {
  const stream = videoElement?.srcObject;
  const track = stream?.getVideoTracks?.()[0];
  if (!track?.applyConstraints || !track.getCapabilities) return;

  const capabilities = track.getCapabilities();
  const advanced = {};

  if (capabilities.focusMode?.includes?.('continuous')) advanced.focusMode = 'continuous';
  if (capabilities.exposureMode?.includes?.('continuous')) advanced.exposureMode = 'continuous';
  if (capabilities.whiteBalanceMode?.includes?.('continuous')) advanced.whiteBalanceMode = 'continuous';

  if (Object.keys(advanced).length === 0) return;

  try {
    await track.applyConstraints({ advanced: [advanced] });
  } catch (_) {
    // Bazı Android cihazlar yeteneği bildirse de ayarı reddedebilir.
    // Bu durumda kamera mevcut ayarlarıyla çalışmaya devam eder.
  }
}
