import { Component, OnInit } from '@angular/core';
import {MenuComponent} from "../menu/menu.component";
import {NgFor, NgIf, NgTemplateOutlet} from "@angular/common";
import {ApiItem, ApiPhoto, ApiPlace, ApiResponse, ApiService, FullListResponse} from "../services/api.service";
import {FormsModule} from "@angular/forms";
import {PhotoGalleryComponent} from '../photo-gallery/photo-gallery.component';

type PlaceDraft = {
  name: string;
  description: string;
  parent_place_id: number | null;
};

type ItemDraft = {
  name: string;
  description: string;
  place_id: number | null;
};

@Component({
  selector: 'app-list-items',
  standalone: true,
  imports: [MenuComponent, NgFor, NgIf, NgTemplateOutlet, FormsModule, PhotoGalleryComponent],
  templateUrl: './list-items.component.html',
  styleUrl: './list-items.component.css'
})
export class ListItemsComponent implements OnInit {
  places: ApiPlace[] = [];
  rootPlaces: ApiPlace[] = [];
  unplacedItems: ApiItem[] = [];
  selectedPlaceByItemId: Record<number, number | null> = {};
  editingPlaceId: number | null = null;
  editingItemId: number | null = null;
  placeDraft: PlaceDraft = { name: '', description: '', parent_place_id: null };
  itemDraft: ItemDraft = { name: '', description: '', place_id: null };
  loading = false;
  message = '';

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.load();
  }

  load(clearMessage = true) {
    this.loading = true;
    if (clearMessage) {
      this.message = '';
    }
    this.api.getFullList().subscribe({
      next: (response: FullListResponse) => {
        this.loading = false;
        if (response.status === 'ok') {
          this.places = response.places || [];
          this.rootPlaces = response.rootPlaces || response.places || [];
          this.unplacedItems = response.unplacedItems || [];
          this.selectedPlaceByItemId = {};
          this.unplacedItems.forEach((item) => {
            this.selectedPlaceByItemId[item.id] = null;
          });
          return;
        }
        this.message = response.description || 'Не удалось загрузить каталог.';
      },
      error: (response: { error?: ApiResponse }) => {
        this.loading = false;
        this.message = response.error?.description || 'Сервер не ответил.';
      },
    });
  }

  deletePlace(place: ApiPlace) {
    if (!confirm(`Удалить место "${place.name}"? Вещи останутся без места.`)) {
      return;
    }

    this.api.deletePlace(place.id).subscribe({
      next: () => this.load(),
      error: (response: { error?: ApiResponse }) => {
        this.message = response.error?.description || 'Не удалось удалить место.';
      },
    });
  }

  startEditPlace(place: ApiPlace) {
    this.editingItemId = null;
    this.editingPlaceId = place.id;
    this.placeDraft = {
      name: place.name,
      description: place.description || '',
      parent_place_id: place.parent_place_id,
    };
  }

  cancelEditPlace() {
    this.editingPlaceId = null;
  }

  savePlace(place: ApiPlace) {
    const name = this.placeDraft.name.trim();
    const description = this.placeDraft.description || '';
    if (!name) {
      this.message = 'Введите название места.';
      return;
    }
    if (description.length > 250) {
      this.message = 'Описание должно быть не длиннее 250 символов.';
      return;
    }

    this.message = 'Сохраняю место...';
    this.api.savePlace(place.qr_string, name, description, this.placeDraft.parent_place_id).subscribe({
      next: () => {
        this.editingPlaceId = null;
        this.message = 'Место обновлено.';
        this.load(false);
      },
      error: (response: { error?: ApiResponse }) => {
        this.message = response.error?.description || 'Не удалось сохранить место.';
      },
    });
  }

  deleteItem(item: ApiItem) {
    if (!confirm(`Удалить вещь "${item.name}"?`)) {
      return;
    }

    this.api.deleteItem(item.id).subscribe({
      next: () => this.load(),
      error: (response: { error?: ApiResponse }) => {
        this.message = response.error?.description || 'Не удалось удалить вещь.';
      },
    });
  }

  startEditItem(item: ApiItem) {
    this.editingPlaceId = null;
    this.editingItemId = item.id;
    this.itemDraft = {
      name: item.name,
      description: item.description || '',
      place_id: item.place_id,
    };
  }

  cancelEditItem() {
    this.editingItemId = null;
  }

  saveItem(item: ApiItem) {
    const name = this.itemDraft.name.trim();
    const description = this.itemDraft.description || '';
    if (!name) {
      this.message = 'Введите название вещи.';
      return;
    }
    if (description.length > 250) {
      this.message = 'Описание должно быть не длиннее 250 символов.';
      return;
    }

    this.message = 'Сохраняю вещь...';
    this.api.saveItem(item.qr_string, name, description, this.itemDraft.place_id).subscribe({
      next: () => {
        this.editingItemId = null;
        this.message = 'Вещь обновлена.';
        this.load(false);
      },
      error: (response: { error?: ApiResponse }) => {
        this.message = response.error?.description || 'Не удалось сохранить вещь.';
      },
    });
  }

  takeItem(item: ApiItem) {
    this.saveItemLocation(item, null, 'Вещь отмечена как без места / на руках.');
  }

  putItem(item: ApiItem) {
    const placeId = this.selectedPlaceByItemId[item.id];
    if (!placeId) {
      this.message = 'Выберите место, куда положить вещь.';
      return;
    }

    this.saveItemLocation(item, placeId, 'Вещь перемещена.');
  }

  photoUrl(url: string | null): string {
    return this.api.assetUrl(url);
  }

  uploadPlacePhoto(place: ApiPlace, event: Event) {
    this.uploadPhotos('place', place.id, event);
  }

  uploadItemPhoto(item: ApiItem, event: Event) {
    this.uploadPhotos('item', item.id, event);
  }

  deletePlacePhoto(place: ApiPlace, photo: ApiPhoto) {
    this.deletePhoto('place', place.id, photo.id);
  }

  deleteItemPhoto(item: ApiItem, photo: ApiPhoto) {
    this.deletePhoto('item', item.id, photo.id);
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

  availableParentPlaces(currentPlace: ApiPlace): ApiPlace[] {
    const blockedIds = new Set<number>([currentPlace.id]);
    const collectDescendants = (placeId: number) => {
      this.places
        .filter((place) => place.parent_place_id === placeId)
        .forEach((place) => {
          if (blockedIds.has(place.id)) {
            return;
          }
          blockedIds.add(place.id);
          collectDescendants(place.id);
        });
    };
    collectDescendants(currentPlace.id);

    return this.places.filter((place) => !blockedIds.has(place.id));
  }

  private uploadPhotos(targetType: 'place' | 'item', targetId: number, event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    input.value = '';

    if (files.length === 0) {
      return;
    }

    let uploaded = 0;
    const uploadNext = () => {
      this.message = files.length === 1
        ? 'Загружаю фото...'
        : `Загружаю фото ${uploaded + 1}/${files.length}...`;

      this.api.uploadPhoto(targetType, targetId, files[uploaded]).subscribe({
        next: () => {
          uploaded += 1;
          if (uploaded < files.length) {
            uploadNext();
            return;
          }

          this.message = files.length === 1 ? 'Фото сохранено.' : `Фото сохранены: ${files.length}.`;
          this.load(false);
        },
        error: (response: { error?: ApiResponse }) => {
          this.message = response.error?.description || 'Не удалось загрузить фото.';
        },
      });
    };

    uploadNext();
  }

  private deletePhoto(targetType: 'place' | 'item', targetId: number, photoId: number) {
    this.message = 'Удаляю фото...';
    this.api.deletePhoto(targetType, targetId, photoId).subscribe({
      next: () => {
        this.message = 'Фото удалено.';
        this.load(false);
      },
      error: (response: { error?: ApiResponse }) => {
        this.message = response.error?.description || 'Не удалось удалить фото.';
      },
    });
  }

  private saveItemLocation(item: ApiItem, placeId: number | null, successMessage: string) {
    this.message = 'Сохраняю место вещи...';
    this.api.saveItem(item.qr_string, item.name, item.description || '', placeId).subscribe({
      next: () => {
        this.message = successMessage;
        this.load(false);
      },
      error: (response: { error?: ApiResponse }) => {
        this.message = response.error?.description || 'Не удалось изменить место вещи.';
      },
    });
  }
}
