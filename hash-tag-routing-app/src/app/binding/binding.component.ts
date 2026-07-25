import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import {NgFor, NgIf} from "@angular/common";
import {MenuComponent} from "../menu/menu.component";
import QrScanner from 'qr-scanner';
import {MatButtonModule} from "@angular/material/button";
import {MatInputModule} from "@angular/material/input";
import {MatFormFieldModule} from "@angular/material/form-field";
import {FormControl, FormsModule, ReactiveFormsModule, Validators} from "@angular/forms";
import {
  ApiItem,
  ApiPlace,
  ApiResponse,
  ApiService,
  FullListResponse,
  ResolveQrResponse,
  SaveItemResponse,
  SavePlaceResponse
} from "../services/api.service";

type BindingMode = 'idle' | 'place' | 'item' | 'unknown';

@Component({
  selector: 'app-binding',
  standalone: true,
  imports: [
    MenuComponent,
    MatButtonModule,
    NgIf,
    NgFor,
    MatInputModule,
    MatFormFieldModule,
    FormsModule,
    ReactiveFormsModule
  ],
  templateUrl: './binding.component.html',
  styleUrl: './binding.component.css',
  changeDetection: ChangeDetectionStrategy.Default
})
export class BindingComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('video') videoElem!: ElementRef<HTMLVideoElement>;

  qrFormControl = new FormControl('', [Validators.required]);
  nameFormControl = new FormControl('', [Validators.required]);
  placeFormControl = new FormControl<number | null>(null, [Validators.required]);

  scanner: QrScanner | null = null;
  scanOn = false;
  cameraId = 0;
  camList: QrScanner.Camera[] = [];
  cameraInitialized = false;

  mode: BindingMode = 'idle';
  currentQr = '';
  message = '';
  loading = false;
  places: ApiPlace[] = [];
  existingPlace: ApiPlace | null = null;
  existingItem: ApiItem | null = null;

  constructor(
    private cd: ChangeDetectorRef,
    private ngZone: NgZone,
    private api: ApiService
  ) {}

  ngOnInit(): void {
    this.loadPlaces();
  }

  ngAfterViewInit(): void {}

  ngOnDestroy(): void {
    this.stopScan();
    if (this.scanner) {
      this.scanner.destroy();
    }
  }

  loadPlaces() {
    this.api.getFullList().subscribe({
      next: (response: FullListResponse) => {
        if (response.status === 'ok') {
          this.places = response.places || [];
          if (!this.placeFormControl.value && this.places.length > 0) {
            this.placeFormControl.setValue(this.places[0].id);
          }
        }
      },
    });
  }

  resolveTypedQr() {
    const value = this.qrFormControl.getRawValue() || '';
    this.processResult(value);
  }

  processResult(result: string) {
    const qrString = result.trim();
    if (!qrString) {
      this.message = 'Введите или отсканируйте QR-код.';
      return;
    }

    this.currentQr = qrString;
    this.qrFormControl.setValue(qrString);
    this.message = '';
    this.loading = true;
    this.existingPlace = null;
    this.existingItem = null;

    this.api.resolveQr(qrString).subscribe({
      next: (response: ResolveQrResponse) => {
        this.loading = false;
        if (response.status !== 'ok') {
          this.message = response.description || 'Не удалось прочитать QR.';
          return;
        }

        this.mode = response.type;
        if (response.found && response.place) {
          this.existingPlace = response.place;
          this.nameFormControl.setValue(response.place.name);
        } else if (response.found && response.item) {
          this.existingItem = response.item;
          this.nameFormControl.setValue(response.item.name);
          this.placeFormControl.setValue(response.item.place_id);
        } else {
          this.nameFormControl.setValue('');
          if (this.mode === 'item' && this.places.length > 0) {
            this.placeFormControl.setValue(this.places[0].id);
          }
        }

        if (this.mode === 'unknown') {
          this.message = 'Этот QR не похож на place:* или item:*.';
        }
      },
      error: (response: { error?: ApiResponse }) => {
        this.loading = false;
        this.message = response.error?.description || 'Сервер не ответил.';
      },
    });
  }

  savePlace() {
    this.nameFormControl.markAsTouched();
    if (this.nameFormControl.invalid || !this.currentQr) {
      this.message = 'Введите название места.';
      return;
    }

    this.loading = true;
    this.api.savePlace(this.currentQr, this.nameFormControl.getRawValue() || '').subscribe({
      next: (response: SavePlaceResponse) => {
        this.loading = false;
        this.existingPlace = response.place;
        this.mode = 'place';
        this.message = 'Место сохранено.';
        this.loadPlaces();
      },
      error: (response: { error?: ApiResponse }) => {
        this.loading = false;
        this.message = response.error?.description || 'Не удалось сохранить место.';
      },
    });
  }

  saveItem() {
    this.nameFormControl.markAsTouched();
    this.placeFormControl.markAsTouched();
    if (this.nameFormControl.invalid || this.placeFormControl.invalid || !this.currentQr) {
      this.message = 'Введите название вещи и выберите место.';
      return;
    }

    this.loading = true;
    this.api.saveItem(
      this.currentQr,
      this.nameFormControl.getRawValue() || '',
      Number(this.placeFormControl.getRawValue())
    ).subscribe({
      next: (response: SaveItemResponse) => {
        this.loading = false;
        this.existingItem = response.item;
        this.mode = 'item';
        this.message = 'Вещь сохранена.';
      },
      error: (response: { error?: ApiResponse }) => {
        this.loading = false;
        this.message = response.error?.description || 'Не удалось сохранить вещь.';
      },
    });
  }

  photoUrl(url: string | null): string {
    return this.api.assetUrl(url);
  }

  uploadCurrentPhoto(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) {
      return;
    }

    const target = this.currentPhotoTarget();
    if (!target) {
      this.message = 'Сначала сохраните место или вещь.';
      return;
    }

    this.message = 'Загружаю фото...';
    this.api.uploadPhoto(target.type, target.id, file).subscribe({
      next: (response) => {
        if (response.place) {
          this.existingPlace = response.place;
          this.loadPlaces();
        }
        if (response.item) {
          this.existingItem = response.item;
        }
        this.message = 'Фото сохранено.';
      },
      error: (response: { error?: ApiResponse }) => {
        this.message = response.error?.description || 'Не удалось загрузить фото.';
      },
    });
  }

  deleteCurrentPhoto() {
    const target = this.currentPhotoTarget();
    if (!target) {
      return;
    }

    this.message = 'Удаляю фото...';
    this.api.deletePhoto(target.type, target.id).subscribe({
      next: (response) => {
        if (response.place) {
          this.existingPlace = response.place;
          this.loadPlaces();
        }
        if (response.item) {
          this.existingItem = response.item;
        }
        this.message = 'Фото удалено.';
      },
      error: (response: { error?: ApiResponse }) => {
        this.message = response.error?.description || 'Не удалось удалить фото.';
      },
    });
  }

  currentPhotoUrl(): string {
    if (this.mode === 'place' && this.existingPlace?.photo_url) {
      return this.photoUrl(this.existingPlace.photo_url);
    }
    if (this.mode === 'item' && this.existingItem?.photo_url) {
      return this.photoUrl(this.existingItem.photo_url);
    }
    return '';
  }

  private currentPhotoTarget(): { type: 'place' | 'item'; id: number } | null {
    if (this.mode === 'place' && this.existingPlace) {
      return { type: 'place', id: this.existingPlace.id };
    }
    if (this.mode === 'item' && this.existingItem) {
      return { type: 'item', id: this.existingItem.id };
    }
    return null;
  }

  startScan() {
    setTimeout(() => {
      if (!this.cameraInitialized) {
        QrScanner.WORKER_PATH = './assets/js/qr-scanner-worker.min.js';
        this.scanner = new QrScanner(this.videoElem.nativeElement, (result: string | { data: string }) => {
          const qrText = typeof result === 'string' ? result : result.data;
          this.ngZone.run(() => {
            this.stopScan();
            this.processResult(qrText);
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

  toggleFlash() {
    if (this.scanner) {
      this.scanner.toggleFlash();
    }
  }
}
