import { Component, AfterViewInit } from '@angular/core';
import * as L from 'leaflet';


@Component({
  selector: 'app-map',
  standalone: true,
  imports: [],
  templateUrl: './map.component.html',
  styleUrl: './map.component.css'
})


export class MapComponent implements AfterViewInit {
  private map: L.Map | undefined;

  ngAfterViewInit(): void {
    this.initMap();
  }

  private initMap(): void {
    const initialCoordinates = this.getInitialCoordinates();
    this.map = L.map('map').setView(initialCoordinates, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    // Add a marker
    L.marker([51.5, -0.09])
      .addTo(this.map)
      .bindPopup('A sample marker!')
      .openPopup();

    // Add click event listener to the map
    this.map.on('click', (event: L.LeafletMouseEvent) => {
      const { lat, lng } = event.latlng;
      console.log(`Clicked location: Latitude: ${lat}, Longitude: ${lng}`);
      this.saveLocationToDatabase(lat, lng);
    });
  }

  private getInitialCoordinates(): [number, number] {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          this.map?.setView([latitude, longitude], 13);
        },
        (error) => {
          console.error('Geolocation error:', error);
          // Fallback to default coordinates
          this.map?.setView([51.505, -0.09], 13);
        }
      );
    } else {
      console.error('Geolocation is not supported by this browser.');
      // Fallback to default coordinates
      return [51.505, -0.09];
    }
    // Default coordinates until geolocation resolves
    return [51.505, -0.09];
  }

  private saveLocationToDatabase(lat: number, lng: number): void {
    // Replace this with your actual database save logic
    console.log(`Saving location to database: Latitude: ${lat}, Longitude: ${lng}`);
    // Example: Call an API or service to save the location
  }
}
