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
import {MatButtonModule} from "@angular/material/button";
import {MatInputModule} from "@angular/material/input";
import {MatFormFieldModule} from "@angular/material/form-field";
import {FormControl, FormsModule, ReactiveFormsModule, Validators} from "@angular/forms";
import {
  ApiItem,
  ApiPhoto,
  ApiPlace,
  ApiResponse,
  ApiService,
  FullListResponse,
  ResolveQrResponse,
  SaveItemResponse,
  SavePlaceResponse
} from "../services/api.service";
import {WideCodeCamera, WideCodeScanner} from "../services/wide-code-scanner";
import {PhotoGalleryComponent} from '../photo-gallery/photo-gallery.component';

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
    ReactiveFormsModule,
    PhotoGalleryComponent
  ],
  templateUrl: './binding.component.html',
  styleUrl: './binding.component.css',
  changeDetection: ChangeDetectionStrategy.Default
})
export class BindingComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('video') videoElem!: ElementRef<HTMLVideoElement>;

  qrFormControl = new FormControl('', [Validators.required]);
  nameFormControl = new FormControl('', [Validators.required]);
  descriptionFormControl = new FormControl('', [Validators.maxLength(250)]);
  placeFormControl = new FormControl<number | null>(null);
  parentPlaceFormControl = new FormControl<number | null>(null);

  scanner: WideCodeScanner | null = null;
  scanOn = false;
  cameraId = 0;
  camList: WideCodeCamera[] = [];
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
      this.message = 'Введите или отсканируйте код.';
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
          this.descriptionFormControl.setValue(response.place.description || '');
          this.parentPlaceFormControl.setValue(response.place.parent_place_id);
        } else if (response.found && response.item) {
          this.existingItem = response.item;
          this.nameFormControl.setValue(response.item.name);
          this.descriptionFormControl.setValue(response.item.description || '');
          this.placeFormControl.setValue(response.item.place_id);
        } else {
          this.nameFormControl.setValue('');
          this.descriptionFormControl.setValue('');
          if (this.mode === 'place') {
            this.parentPlaceFormControl.setValue(null);
          }
          if (this.mode === 'item') {
            this.placeFormControl.setValue(null);
          }
        }

        if (!response.found && this.mode === 'item' && qrString.indexOf('item:') !== 0) {
          this.message = 'Это новый заводской код. Его можно привязать как вещь.';
        } else if (this.mode === 'unknown') {
          this.message = 'Этот код можно привязать как вещь.';
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
    this.descriptionFormControl.markAsTouched();
    if (this.nameFormControl.invalid || !this.currentQr) {
      this.message = 'Введите название места.';
      return;
    }
    if (this.descriptionFormControl.invalid) {
      this.message = 'Описание должно быть не длиннее 250 символов.';
      return;
    }

    this.loading = true;
    this.api.savePlace(
      this.currentQr,
      this.nameFormControl.getRawValue() || '',
      this.descriptionFormControl.getRawValue() || '',
      this.parentPlaceFormControl.getRawValue()
    ).subscribe({
      next: (response: SavePlaceResponse) => {
        this.loading = false;
        this.existingPlace = response.place;
        this.parentPlaceFormControl.setValue(response.place.parent_place_id);
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
    this.descriptionFormControl.markAsTouched();
    if (this.nameFormControl.invalid || !this.currentQr) {
      this.message = 'Введите название вещи.';
      return;
    }
    if (this.descriptionFormControl.invalid) {
      this.message = 'Описание должно быть не длиннее 250 символов.';
      return;
    }

    this.loading = true;
    this.api.saveItem(
      this.currentQr,
      this.nameFormControl.getRawValue() || '',
      this.descriptionFormControl.getRawValue() || '',
      this.placeFormControl.getRawValue()
    ).subscribe({
      next: (response: SaveItemResponse) => {
        this.loading = false;
        this.existingItem = response.item;
        this.placeFormControl.setValue(response.item.place_id);
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
    const files = Array.from(input.files || []);
    input.value = '';

    if (files.length === 0) {
      return;
    }

    const target = this.currentPhotoTarget();
    if (!target) {
      this.message = 'Сначала сохраните место или вещь.';
      return;
    }

    let uploaded = 0;
    const uploadNext = () => {
      this.message = files.length === 1
        ? 'Загружаю фото...'
        : `Загружаю фото ${uploaded + 1}/${files.length}...`;

      this.api.uploadPhoto(target.type, target.id, files[uploaded]).subscribe({
        next: (response) => {
          if (response.place) {
            this.existingPlace = response.place;
          }
          if (response.item) {
            this.existingItem = response.item;
          }

          uploaded += 1;
          if (uploaded < files.length) {
            uploadNext();
            return;
          }

          if (response.place) {
            this.loadPlaces();
          }
          this.message = files.length === 1 ? 'Фото сохранено.' : `Фото сохранены: ${files.length}.`;
        },
        error: (response: { error?: ApiResponse }) => {
          this.message = response.error?.description || 'Не удалось загрузить фото.';
        },
      });
    };

    uploadNext();
  }

  deleteCurrentPhoto(photo: ApiPhoto) {
    const target = this.currentPhotoTarget();
    if (!target) {
      return;
    }

    this.message = 'Удаляю фото...';
    this.api.deletePhoto(target.type, target.id, photo.id).subscribe({
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

  currentPhotos(): ApiPhoto[] {
    if (this.mode === 'place') {
      return this.existingPlace?.photos || [];
    }
    if (this.mode === 'item') {
      return this.existingItem?.photos || [];
    }
    return [];
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

  availableParentPlaces(): ApiPlace[] {
    const currentId = this.existingPlace?.id || null;
    if (!currentId) {
      return this.places;
    }

    const descendantIds = new Set<number>();
    const collectDescendants = (placeId: number) => {
      this.places
        .filter((place) => place.parent_place_id === placeId)
        .forEach((place) => {
          if (descendantIds.has(place.id)) {
            return;
          }
          descendantIds.add(place.id);
          collectDescendants(place.id);
        });
    };
    collectDescendants(currentId);

    return this.places.filter((place) => place.id !== currentId && !descendantIds.has(place.id));
  }

  placeOptionLabel(place: ApiPlace): string {
    const names = [place.name];
    const seenIds = new Set<number>([place.id]);
    let parentId = place.parent_place_id;

    while (parentId && !seenIds.has(parentId)) {
      const parent = this.places.find((candidate) => candidate.id === parentId);
      if (!parent) {
        break;
      }
      names.unshift(parent.name);
      seenIds.add(parent.id);
      parentId = parent.parent_place_id;
    }

    return names.join(' / ');
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
            this.processResult(qrText);
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

  toggleFlash() {
    if (this.scanner) {
      this.scanner.toggleFlash().then((enabled) => {
        if (!enabled) {
          this.message = 'Подсветка недоступна для этой камеры или браузера.';
        }
      }).catch(() => {
        this.message = 'Не удалось переключить подсветку.';
      });
    }
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
