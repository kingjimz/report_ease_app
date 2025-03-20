import { Component, OnInit } from '@angular/core';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { Router, RouterOutlet } from '@angular/router';
import { ApiService } from './_services/api.service';

@Component({
  standalone: true,
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  imports: [RouterOutlet]
})
export class AppComponent implements OnInit {
  constructor(private auth: Auth, private router: Router, private api: ApiService) {}

  ngOnInit() {
    onAuthStateChanged(this.auth, (user) => {
      if (user) {
        this.router.navigateByUrl('/');
        this.loadBibleStudies();
      } else {
        this.router.navigateByUrl('/login');
      }
    });
  }

  async loadBibleStudies() {
    await this.api.getBibleStudies().then((data) => {
    }).catch(error => {
      console.error('Error fetching Bible studies:', error);
    });
  }
}
