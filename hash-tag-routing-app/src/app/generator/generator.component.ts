import { Component } from '@angular/core';
import {MenuComponent} from "../menu/menu.component";
import {MatGridListModule} from "@angular/material/grid-list";
import {MatButtonModule} from '@angular/material/button';
import {NgFor, NgForOf} from "@angular/common";
import {SharedModule} from "../shared.module";
import {QRCodeModule} from "angularx-qrcode";

@Component({
  selector: 'app-generator',
  standalone: true,
  imports: [MenuComponent, MatGridListModule, MatButtonModule, NgForOf, QRCodeModule],
  templateUrl: './generator.component.html',
  styleUrl: './generator.component.css'
})
export class GeneratorComponent {
  places: string[] = []
  items: string[] = []

  ngOnInit(): void {
    this.generate();
  }

  generate() {
    this.places = [];
    this.items = [];
    let id = Math.floor(Date.now() / 100);
    for(let i = 0; i < 12; i++) {
      this.places.push(`place:${id}`);
      id++;
    }
    for(let i = 0; i < 30; i++) {
      this.items.push(`item:${id}`);
      id++;
    }
  }

  print() {
    window.print();
  }
}
