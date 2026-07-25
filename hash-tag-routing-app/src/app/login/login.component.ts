import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {MatInputModule} from '@angular/material/input';
import {MatFormFieldModule} from '@angular/material/form-field';
import {ErrorStateMatcher} from '@angular/material/core';
import {MatButtonModule} from '@angular/material/button';
import {FormControl,
  FormGroupDirective,
  NgForm,
  Validators,
  FormsModule,
  ReactiveFormsModule,} from '@angular/forms';
import {ApiResponse, ApiService, AuthResponse} from "../services/api.service";


/** Error when invalid control is dirty, touched, or submitted. */
export class MyErrorStateMatcher implements ErrorStateMatcher {
  isErrorState(control: FormControl | null, form: FormGroupDirective | NgForm | null): boolean {
    const isSubmitted = form && form.submitted;
    return !!(control && control.invalid && (control.dirty || control.touched || isSubmitted));
  }
}

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
  imports: [FormsModule, MatFormFieldModule, MatInputModule, ReactiveFormsModule, MatButtonModule]
})
export class LoginComponent implements OnInit {
  usernameFormControl = new FormControl('', [Validators.required]);
  passwordFormControl = new FormControl('', [Validators.required]);
  matcher = new MyErrorStateMatcher();
  loading = false;
  message = '';

  constructor(private router: Router, private api: ApiService) { }

  ngOnInit(): void {
    if (this.api.isLoggedIn()) {
      this.router.navigate(['/list-items']);
    }
  }

  login() {
    this.submit('login');
  }

  register() {
    this.submit('register');
  }

  private submit(mode: 'login' | 'register') {
    this.message = '';
    this.usernameFormControl.markAsTouched();
    this.passwordFormControl.markAsTouched();

    if (this.usernameFormControl.invalid || this.passwordFormControl.invalid) {
      this.message = 'Введите логин и пароль.';
      return;
    }

    const username = this.usernameFormControl.getRawValue() || '';
    const password = this.passwordFormControl.getRawValue() || '';
    const request = mode === 'login'
      ? this.api.authorize(username, password)
      : this.api.register(username, password);

    this.loading = true;
    request.subscribe({
      next: (response: AuthResponse) => {
        this.loading = false;
        if (response.status === 'ok' && response.session_id) {
          this.api.setSession(response);
          this.router.navigate(['/list-items']);
          return;
        }
        this.message = response.description || 'Не удалось войти.';
      },
      error: (response: { error?: ApiResponse }) => {
        this.loading = false;
        this.message = response.error?.description || 'Сервер не ответил. Проверьте, что backend запущен.';
      },
    });
  }

}
