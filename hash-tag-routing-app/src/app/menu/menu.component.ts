import {ChangeDetectorRef, Component} from '@angular/core';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {Router} from "@angular/router";
import {ApiService} from "../services/api.service";

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [MatButtonToggleModule],
  templateUrl: './menu.component.html',
  styleUrl: './menu.component.css'
})
export class MenuComponent {
  page: string = "list-items";

  constructor(
    private router: Router,
    private cd: ChangeDetectorRef,
    public api: ApiService
  ) {
  }

  ngOnInit(): void {
    const cleanUrl = this.router.url.substring(1);

    if (cleanUrl) {
      this.page = cleanUrl;
      this.cd.markForCheck();
    }
  }


  action(act: string) {
    this.router.navigate(['/'+act]);
  }

  logout() {
    this.api.logout().subscribe({
      next: () => {
        this.api.clearSession();
        this.router.navigate(['/login']);
      },
      error: () => {
        this.api.clearSession();
        this.router.navigate(['/login']);
      },
    });
  }
}
