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

  load() {
    this.loading = true;
    this.message = '';
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
}
