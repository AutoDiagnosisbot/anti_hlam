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
import QrScanner from "qr-scanner";
import {ApiResponse, ApiService, ResolveQrResponse} from "../services/api.service";

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
  scanner: QrScanner | null = null;
  scanOn = false;
  cameraInitialized = false;
  cameraId = 0;
  camList: QrScanner.Camera[] = [];
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
      this.message = 'Введите или отсканируйте QR-код.';
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
          this.message = 'Такой QR пока не привязан.';
        }
      },
      error: (response: { error?: ApiResponse }) => {
        this.loading = false;
        this.message = response.error?.description || 'Сервер не ответил.';
      },
    });
  }

  startScan() {
    setTimeout(() => {
      if (!this.cameraInitialized) {
        QrScanner.WORKER_PATH = './assets/js/qr-scanner-worker.min.js';
        this.scanner = new QrScanner(this.videoElem.nativeElement, (result: string | { data: string }) => {
          const qrText = typeof result === 'string' ? result : result.data;
          this.ngZone.run(() => {
            this.stopScan();
            this.findQr(qrText);
          });
        }, {
          highlightScanRegion: true,
          highlightCodeOutline: true,
        });
        this.cameraInitialized = true;
      }

      if (!this.scanner) {
        return;
      }

      this.scanner.start().then(() => {
        QrScanner.listCameras(true).then((cameras: QrScanner.Camera[]) => {
          this.camList = cameras;
        });
      });
      this.scanOn = true;
      this.message = '';
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
    this.scanner.setCamera(this.camList[this.cameraId].id);
  }
}
