import type {BrowserMultiFormatReader, IScannerControls} from '@zxing/browser';
import type {BarcodeFormat, DecodeHintType, Result} from '@zxing/library';

export interface WideCodeCamera {
  id: string;
  label: string;
}

type ZxingBrowserModule = typeof import('@zxing/browser');
type ZxingLibraryModule = typeof import('@zxing/library');

let zxingModules: Promise<{
  browser: ZxingBrowserModule;
  library: ZxingLibraryModule;
}> | null = null;

function loadZxing() {
  if (!zxingModules) {
    zxingModules = Promise.all([
      import('@zxing/browser'),
      import('@zxing/library'),
    ]).then(([browser, library]) => ({ browser, library }));
  }

  return zxingModules;
}

function makeHints(library: ZxingLibraryModule): Map<DecodeHintType, unknown> {
  const BarcodeFormat = library.BarcodeFormat;
  const DecodeHintType = library.DecodeHintType;
  const supportedFormats: BarcodeFormat[] = [
    BarcodeFormat.QR_CODE,
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.CODE_93,
    BarcodeFormat.CODABAR,
    BarcodeFormat.ITF,
    BarcodeFormat.PDF_417,
    BarcodeFormat.AZTEC,
  ];
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, supportedFormats);
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.CHARACTER_SET, 'UTF-8');
  return hints;
}

export class WideCodeScanner {
  private reader: BrowserMultiFormatReader | null = null;
  private controls: IScannerControls | null = null;
  private torchOn = false;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onCode: (code: string) => void
  ) {}

  static async listCameras(): Promise<WideCodeCamera[]> {
    const { browser } = await loadZxing();
    const devices = await browser.BrowserMultiFormatReader.listVideoInputDevices();
    return devices.map((device, index) => ({
      id: device.deviceId,
      label: device.label || `Камера ${index + 1}`,
    }));
  }

  async start(deviceId?: string): Promise<void> {
    this.stop();
    this.torchOn = false;
    const reader = await this.getReader();
    this.controls = await reader.decodeFromVideoDevice(deviceId, this.video, (result?: Result) => {
      const text = result?.getText().trim();
      if (text) {
        this.onCode(text);
      }
    });
  }

  stop(): void {
    if (this.controls) {
      this.controls.stop();
      this.controls = null;
    }
  }

  destroy(): void {
    this.stop();
  }

  async toggleFlash(): Promise<boolean> {
    if (!this.controls?.switchTorch) {
      return false;
    }

    this.torchOn = !this.torchOn;
    await this.controls.switchTorch(this.torchOn);
    return true;
  }

  private async getReader(): Promise<BrowserMultiFormatReader> {
    if (!this.reader) {
      const { browser, library } = await loadZxing();
      this.reader = new browser.BrowserMultiFormatReader(makeHints(library), {
        delayBetweenScanAttempts: 120,
        delayBetweenScanSuccess: 400,
        tryPlayVideoTimeout: 5000,
      });
    }

    return this.reader;
  }
}
