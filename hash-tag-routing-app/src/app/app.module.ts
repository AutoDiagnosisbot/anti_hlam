import { NgModule, isDevMode } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import {LoginComponent} from "./login/login.component";
import {ListItemsComponent} from "./list-items/list-items.component";
import {GeneratorComponent} from "./generator/generator.component";
import {ScanComponent} from "./scan/scan.component";
import { ServiceWorkerModule } from '@angular/service-worker';
import { provideAnimations } from '@angular/platform-browser/animations';

@NgModule({
  imports: [
    BrowserModule,
    FormsModule,
    HttpClientModule,
    AppRoutingModule,
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: !isDevMode(),
      // Register the ServiceWorker as soon as the application is stable
      // or after 30 seconds (whichever comes first).
      registrationStrategy: 'registerWhenStable:30000'
    })
  ],
  declarations: [

  ],
  providers:[provideAnimations()],
  bootstrap: [ AppComponent ]
})
export class AppModule { }
