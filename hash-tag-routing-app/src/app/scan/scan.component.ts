import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild
} from '@angular/core';
import {MenuComponent} from "../menu/menu.component";
import {NgFor, NgIf} from "@angular/common";
import {MatButtonModule} from "@angular/material/button";
import {MatFormFieldModule} from "@angular/material/form-field";
import {MatInputModule} from "@angular/material/input";
import {FormControl, ReactiveFormsModule, Validators} from "@angular/forms";
import {ApiResponse, ApiService, ResolveQrResponse} from "../services/api.service";
import {WideCodeCamera, WideCodeScanner} from "../services/wide-code-scanner";

@Component({
  selector: 'app-scan',
  standalone: true,
  imports: [
    MenuComponent,
    NgIf,
    NgFor,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule
  ],
  templateUrl: './scan.component.html',
  styleUrl: './scan.component.css'
})
export class ScanComponent implements OnDestroy {
  @ViewChild('video') videoElem!: ElementRef<HTMLVideoElement>;

  qrFormControl = new FormControl('', [Validators.required]);
  scanner: WideCodeScanner | null = null;
  scanOn = false;
  cameraInitialized = false;
  cameraId = 0;
  camList: WideCodeCamera[] = [];
  loading = false;
  message = '';
  result: ResolveQrResponse | null = null;

  constructor(
    private api: ApiService,
    private ngZone: NgZone,
    private cd: ChangeDetectorRef
  ) {}

  ngOnDestroy(): void {
    this.stopScan();
    if (this.scanner) {
      this.scanner.destroy();
    }
  }

  findTypedQr() {
    const value = this.qrFormControl.getRawValue() || '';
    this.findQr(value);
  }

  findQr(qrString: string) {
    const cleanQr = qrString.trim();
    if (!cleanQr) {
      this.message = 'Введите или отсканируйте код.';
      return;
    }

    this.qrFormControl.setValue(cleanQr);
    this.loading = true;
    this.message = '';
    this.result = null;

    this.api.resolveQr(cleanQr).subscribe({
      next: (response: ResolveQrResponse) => {
        this.loading = false;
        this.result = response;
        if (response.status !== 'ok') {
          this.message = response.description || 'Не удалось выполнить поиск.';
        } else if (!response.found) {
          this.message = 'Такой код пока не привязан.';
        }
      },
      error: (response: { error?: ApiResponse }) => {
        this.loading = false;
        this.message = response.error?.description || 'Сервер не ответил.';
      },
    });
  }

  photoUrl(url: string | null): string {
    return this.api.assetUrl(url);
  }

  startScan() {
    if (!window.isSecureContext) {
      this.message = 'Камера доступна только через HTTPS или localhost. Откройте приложение по защищенному адресу.';
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      this.message = 'Этот браузер не дает приложению доступ к камере.';
      return;
    }

    setTimeout(() => {
      if (!this.cameraInitialized) {
        this.scanner = new WideCodeScanner(this.videoElem.nativeElement, (qrText: string) => {
          this.ngZone.run(() => {
            this.stopScan();
            this.findQr(qrText);
          });
        });
        this.cameraInitialized = true;
      }

      if (!this.scanner) {
        return;
      }

      this.scanner.start(this.camList[this.cameraId]?.id)
        .then(() => {
          WideCodeScanner.listCameras().then((cameras: WideCodeCamera[]) => {
            this.camList = cameras;
            if (!this.camList[this.cameraId]) {
              this.cameraId = 0;
            }
          });
          this.scanOn = true;
          this.message = '';
        })
        .catch((err: Error) => {
          this.scanOn = false;
          this.message = this.cameraErrorMessage(err);
          this.cd.markForCheck();
        });
    }, 0);
  }

  stopScan() {
    if (this.scanner) {
      this.scanner.stop();
    }
    this.scanOn = false;
    this.cd.markForCheck();
  }

  switchCamera() {
    if (!this.scanner || this.camList.length === 0) {
      return;
    }
    this.cameraId++;
    this.cameraId = this.cameraId % this.camList.length;
    if (!this.scanOn) {
      return;
    }

    this.scanner.start(this.camList[this.cameraId].id)
      .catch((err: Error) => {
        this.scanOn = false;
        this.message = this.cameraErrorMessage(err);
        this.cd.markForCheck();
      });
  }

  private cameraErrorMessage(err: Error): string {
    if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
      return 'Браузер заблокировал камеру. Проверьте разрешение камеры и откройте приложение через HTTPS.';
    }

    if (err?.name === 'NotFoundError') {
      return 'Камера не найдена.';
    }

    return 'Не удалось открыть камеру. Проверьте разрешения браузера и HTTPS.';
  }
}
