import { Component, OnInit } from '@angular/core';
import {MenuComponent} from "../menu/menu.component";
import {NgFor, NgIf} from "@angular/common";
import {ApiItem, ApiPlace, ApiResponse, ApiService, FullListResponse} from "../services/api.service";

@Component({
  selector: 'app-list-items',
  standalone: true,
  imports: [MenuComponent, NgFor, NgIf],
  templateUrl: './list-items.component.html',
  styleUrl: './list-items.component.css'
})
export class ListItemsComponent implements OnInit {
  places: ApiPlace[] = [];
  unplacedItems: ApiItem[] = [];
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
          this.unplacedItems = response.unplacedItems || [];
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

  photoUrl(url: string | null): string {
    return this.api.assetUrl(url);
  }

  uploadPlacePhoto(place: ApiPlace, event: Event) {
    this.uploadPhoto('place', place.id, event);
  }

  uploadItemPhoto(item: ApiItem, event: Event) {
    this.uploadPhoto('item', item.id, event);
  }

  deletePlacePhoto(place: ApiPlace) {
    this.deletePhoto('place', place.id);
  }

  deleteItemPhoto(item: ApiItem) {
    this.deletePhoto('item', item.id);
  }

  private uploadPhoto(targetType: 'place' | 'item', targetId: number, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) {
      return;
    }

    this.message = 'Загружаю фото...';
    this.api.uploadPhoto(targetType, targetId, file).subscribe({
      next: () => {
        this.message = 'Фото сохранено.';
        this.load(false);
      },
      error: (response: { error?: ApiResponse }) => {
        this.message = response.error?.description || 'Не удалось загрузить фото.';
      },
    });
  }

  private deletePhoto(targetType: 'place' | 'item', targetId: number) {
    this.message = 'Удаляю фото...';
    this.api.deletePhoto(targetType, targetId).subscribe({
      next: () => {
        this.message = 'Фото удалено.';
        this.load(false);
      },
      error: (response: { error?: ApiResponse }) => {
        this.message = response.error?.description || 'Не удалось удалить фото.';
      },
    });
  }
}
