import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ApiUser {
  id: number;
  username: string;
}

export interface ApiItem {
  id: number;
  user_id: number;
  place_id: number | null;
  name: string;
  qr_string: string;
  photo_url: string | null;
  photo_mime: string | null;
  photo_original_name: string | null;
  photo_size: number | null;
  photo_uploaded_at: string | null;
  createdAt: string;
  updatedAt: string;
  place?: ApiPlace | null;
}

export interface ApiPlace {
  id: number;
  user_id: number;
  name: string;
  qr_string: string;
  photo_url: string | null;
  photo_mime: string | null;
  photo_original_name: string | null;
  photo_size: number | null;
  photo_uploaded_at: string | null;
  createdAt: string;
  updatedAt: string;
  items: ApiItem[];
}

export interface ApiListRow {
  place_name: string;
  place_id: number | null;
  item_name: string;
  item_id: number;
  item_qr_string: string;
  place_qr_string: string;
}

export interface ApiResponse {
  status: 'ok' | 'error';
  result?: boolean;
  description?: string;
}

export interface AuthResponse extends ApiResponse {
  session_id?: string;
  user?: ApiUser;
}

export interface FullListResponse extends ApiResponse {
  places: ApiPlace[];
  unplacedItems: ApiItem[];
  rows: ApiListRow[];
}

export interface ResolveQrResponse extends ApiResponse {
  found: boolean;
  type: 'place' | 'item' | 'unknown';
  qr_string?: string;
  place?: ApiPlace;
  item?: ApiItem;
}

export interface SavePlaceResponse extends ApiResponse {
  place: ApiPlace;
}

export interface SaveItemResponse extends ApiResponse {
  item: ApiItem;
}

export interface PhotoResponse extends ApiResponse {
  place?: ApiPlace;
  item?: ApiItem;
}

type PhotoTargetType = 'place' | 'item';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly baseUrl = this.resolveBaseUrl();
  private readonly assetOrigin = this.resolveAssetOrigin();

  constructor(private http: HttpClient) {}

  get sessionId(): string {
    return localStorage.getItem('session_id') || '';
  }

  get username(): string {
    return localStorage.getItem('username') || '';
  }

  isLoggedIn(): boolean {
    return Boolean(this.sessionId);
  }

  setSession(response: AuthResponse): void {
    if (response.session_id) {
      localStorage.setItem('session_id', response.session_id);
    }
    if (response.user?.username) {
      localStorage.setItem('username', response.user.username);
    }
    localStorage.setItem('isLoggedIn', response.session_id ? 'true' : 'false');
  }

  clearSession(): void {
    localStorage.removeItem('session_id');
    localStorage.removeItem('username');
    localStorage.removeItem('isLoggedIn');
  }

  authorize(username: string, password: string): Observable<AuthResponse> {
    return this.post<AuthResponse>('authorize', { username, password }, false);
  }

  register(username: string, password: string): Observable<AuthResponse> {
    return this.post<AuthResponse>('register', { username, password }, false);
  }

  logout(): Observable<ApiResponse> {
    return this.post<ApiResponse>('logout', {});
  }

  getFullList(): Observable<FullListResponse> {
    return this.post<FullListResponse>('get_full_list', {});
  }

  resolveQr(qrString: string): Observable<ResolveQrResponse> {
    return this.post<ResolveQrResponse>('resolve_qr', { qr_string: qrString });
  }

  savePlace(qrString: string, name: string): Observable<SavePlaceResponse> {
    return this.post<SavePlaceResponse>('save_place', { qr_string: qrString, name });
  }

  saveItem(qrString: string, name: string, placeId: number): Observable<SaveItemResponse> {
    return this.post<SaveItemResponse>('save_item', {
      qr_string: qrString,
      name,
      place_id: placeId,
    });
  }

  deletePlace(placeId: number): Observable<ApiResponse> {
    return this.post<ApiResponse>('delete_place', { place_id: placeId });
  }

  deleteItem(itemId: number): Observable<ApiResponse> {
    return this.post<ApiResponse>('delete_item', { item_id: itemId });
  }

  uploadPhoto(targetType: PhotoTargetType, targetId: number, file: File): Observable<PhotoResponse> {
    const body = new FormData();
    body.append('session_id', this.sessionId);
    body.append('target_type', targetType);
    body.append('target_id', String(targetId));
    body.append('photo', file);
    return this.http.post<PhotoResponse>(`${this.baseUrl}/upload_photo`, body);
  }

  deletePhoto(targetType: PhotoTargetType, targetId: number): Observable<PhotoResponse> {
    return this.post<PhotoResponse>('delete_photo', {
      target_type: targetType,
      target_id: targetId,
    });
  }

  assetUrl(url: string | null | undefined): string {
    if (!url) {
      return '';
    }
    if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) {
      return url;
    }
    return `${this.assetOrigin}${url}`;
  }

  private post<T>(method: string, payload: Record<string, unknown>, includeSession = true): Observable<T> {
    const body = includeSession ? { ...payload, session_id: this.sessionId } : payload;
    return this.http.post<T>(`${this.baseUrl}/${method}`, body);
  }

  private resolveBaseUrl(): string {
    if (window.location.port === '4200') {
      return 'http://localhost:8083/api';
    }
    return '/api';
  }

  private resolveAssetOrigin(): string {
    if (window.location.port === '4200') {
      return 'http://localhost:8083';
    }
    return '';
  }
}
