import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { ListItemsComponent } from './list-items/list-items.component';
import { ScanComponent } from './scan/scan.component';
import { GeneratorComponent } from './generator/generator.component';
import {authGuard} from "./auth.guard";
import {BindingComponent} from "./binding/binding.component";

const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'list-items', component: ListItemsComponent, canActivate: [authGuard] },
  { path: 'scan', component: ScanComponent, canActivate: [authGuard] },
  { path: 'generator', component: GeneratorComponent, canActivate: [authGuard] },
  { path: 'binding', component: BindingComponent, canActivate: [authGuard] },
  { path: '', redirectTo: '/login', pathMatch: 'full' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
