import {ComponentFixture, TestBed} from '@angular/core/testing';
import {NoopAnimationsModule} from '@angular/platform-browser/animations';
import {ApiService} from '../services/api.service';
import {PhotoGalleryComponent} from './photo-gallery.component';

describe('PhotoGalleryComponent', () => {
  let fixture: ComponentFixture<PhotoGalleryComponent>;
  let component: PhotoGalleryComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PhotoGalleryComponent, NoopAnimationsModule],
      providers: [{provide: ApiService, useValue: {assetUrl: (url: string) => url}}],
    }).compileComponents();
    fixture = TestBed.createComponent(PhotoGalleryComponent);
    component = fixture.componentInstance;
    component.photos = [1, 2].map(id => ({
      id, photo_url: `/photo-${id}.jpg`, photo_mime: 'image/jpeg', photo_original_name: null,
      photo_size: null, photo_uploaded_at: null,
    }));
    component.removable = true;
    fixture.detectChanges();
  });

  afterEach(() => {
    component.close();
    fixture.destroy();
  });

  it('opens the photo instead of deleting it when a thumbnail is clicked', () => {
    const remove = spyOn(component.remove, 'emit');
    fixture.nativeElement.querySelector('.thumbnail').click();
    expect(fixture.nativeElement.querySelector('dialog').open).toBeTrue();
    expect(remove).not.toHaveBeenCalled();
  });

  it('requires confirmation on the separate delete button', () => {
    const confirmation = spyOn(window, 'confirm').and.returnValue(false);
    const remove = spyOn(component.remove, 'emit');
    const button = fixture.nativeElement.querySelector('button.delete');
    button.click();
    expect(confirmation).toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    confirmation.and.returnValue(true);
    button.click();
    expect(remove).toHaveBeenCalledOnceWith(component.photos[0]);
  });

  it('navigates photos and closes on Escape without deleting', () => {
    const remove = spyOn(component.remove, 'emit');
    component.open(0);
    component.step(1);
    expect(component.selectedIndex).toBe(1);
    const dialog = fixture.nativeElement.querySelector('dialog');
    dialog.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    expect(dialog.open).toBeFalse();
    expect(remove).not.toHaveBeenCalled();
  });
});
