import {Component, ElementRef, EventEmitter, Input, OnChanges, Output, ViewChild} from '@angular/core';
import {NgFor, NgIf} from '@angular/common';
import {MatIconModule} from '@angular/material/icon';
import {ApiPhoto, ApiService} from '../services/api.service';

@Component({
  selector: 'app-photo-gallery',
  standalone: true,
  imports: [NgFor, NgIf, MatIconModule],
  templateUrl: './photo-gallery.component.html',
  styleUrl: './photo-gallery.component.css',
})
export class PhotoGalleryComponent implements OnChanges {
  @Input() photos: ApiPhoto[] = [];
  @Input() label = 'Фото';
  @Input() compact = false;
  @Input() removable = false;
  @Output() remove = new EventEmitter<ApiPhoto>();
  @ViewChild('viewer') viewer!: ElementRef<HTMLDialogElement>;

  selectedIndex = 0;

  constructor(private api: ApiService) {}

  ngOnChanges(): void {
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.photos.length - 1));
    if (!this.photos.length) {
      this.viewer?.nativeElement.close();
    }
  }

  photoUrl(photo: ApiPhoto): string {
    return this.api.assetUrl(photo.photo_url);
  }

  open(index: number): void {
    this.selectedIndex = index;
    this.viewer.nativeElement.showModal();
  }

  close(): void {
    this.viewer.nativeElement.close();
  }

  step(direction: number): void {
    if (this.photos.length) {
      this.selectedIndex = (this.selectedIndex + direction + this.photos.length) % this.photos.length;
    }
  }

  closeOnBackdrop(event: MouseEvent): void {
    const dialog = this.viewer.nativeElement;
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom)) {
      this.close();
    }
  }

  confirmRemove(photo: ApiPhoto): void {
    if (confirm(`Удалить фотографию «${this.label}»?`)) {
      this.remove.emit(photo);
    }
  }
}
