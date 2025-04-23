import { Component, AfterViewInit, Output, EventEmitter } from '@angular/core';
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
  private currentMarker: L.Marker | undefined;
  @Output() mapClicked: EventEmitter<{ lat: number; lng: number; locationName: string }> = new EventEmitter();

  ngAfterViewInit(): void {
    this.initMap();
  }

  private initMap(): void {
    this.map = L.map('map').setView([0, 0], 2); // Start with world view until we get location

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    // Get user's location with higher accuracy
    this.getUserLocation();

    // Add click event listener to the map
    this.map.on('click', (event: L.LeafletMouseEvent) => {
      const { lat, lng } = event.latlng;
      
      // Get location name before emitting event
      this.getLocationName(lat, lng, (locationName: string) => {
        // Remove previous marker if exists
        if (this.currentMarker && this.map) {
          this.map.removeLayer(this.currentMarker);
        }
        
        // Add new marker at clicked position
        if (this.map) {
          this.currentMarker = L.marker([lat, lng])
            .addTo(this.map)
            .bindPopup(locationName)
            .openPopup();
        }
        
        // Emit event with coordinates and location name
        this.mapClicked.emit({ lat, lng, locationName });
      });
    });
  }

  private getUserLocation(): void {
    if (navigator.geolocation) {
      const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          console.log(`Location received with accuracy: ${accuracy} meters`);
          
          if (this.map) {
            // Zoom level based on accuracy
            const zoomLevel = this.calculateZoomLevel(accuracy);
            this.map.setView([latitude, longitude], zoomLevel);
            
            // Get and display location name for current position
            this.getLocationName(latitude, longitude, (locationName: string) => {
              if (this.map) {
                // Create initial marker for user's location
                this.currentMarker = L.marker([latitude, longitude])
                  .addTo(this.map)
                  .bindPopup(`Your location: ${locationName}`)
                  .openPopup();
                
                // Add accuracy circle
                L.circle([latitude, longitude], {
                  radius: accuracy,
                  color: 'blue',
                  fillColor: '#3388ff',
                  fillOpacity: 0.1
                }).addTo(this.map);
              }
            });
          }
        },
        (error) => {
          console.error('Geolocation error:', error.message);
          // Fallback to IP-based geolocation
          this.getLocationByIP();
        },
        options
      );
    } else {
      console.error('Geolocation is not supported by this browser.');
      this.getLocationByIP();
    }
  }

  private getLocationByIP(): void {
    // Using ipinfo.io to get approximate location based on IP
    fetch('https://ipinfo.io/json?token=undefined')
      .then(response => response.json())
      .then(data => {
        if (data.loc) {
          const [latitude, longitude] = data.loc.split(',').map(Number);
          if (this.map) {
            this.map.setView([latitude, longitude], 10);
            
            this.getLocationName(latitude, longitude, (locationName: string) => {
              if (this.map) {
                this.currentMarker = L.marker([latitude, longitude])
                  .addTo(this.map)
                  .bindPopup(`Approximate location: ${locationName}`)
                  .openPopup();
              }
            });
          }
        } else {
          // Final fallback
          if (this.map) {
            this.map.setView([51.505, -0.09], 13);
          }
        }
      })
      .catch(error => {
        console.error('IP geolocation error:', error);
        if (this.map) {
          this.map.setView([51.505, -0.09], 13);
        }
      });
  }

  private calculateZoomLevel(accuracy: number): number {
    if (accuracy <= 10) return 18;      // Very high accuracy (few meters)
    if (accuracy <= 50) return 16;      // High accuracy
    if (accuracy <= 100) return 15;     // Good accuracy
    if (accuracy <= 500) return 14;     // Medium accuracy
    if (accuracy <= 1000) return 13;    // Low accuracy
    if (accuracy <= 5000) return 11;    // Very low accuracy
    return 10;                          // Poor accuracy
  }

  private getLocationName(latitude: number, longitude: number, callback: (locationName: string) => void): void {
    // Add cache busting parameter to avoid rate limiting issues
    const timestamp = new Date().getTime();
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=18&addressdetails=1&_=${timestamp}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'AngularMapComponent/1.0'
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.display_name) {
        // Format location name to be more concise
        this.formatLocationName(data, callback);
      } else {
        callback(`Location at ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
      }
    })
    .catch(error => {
      console.error('Error fetching location name:', error);
      callback(`Unknown location at ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
    });
  }

  private formatLocationName(data: any, callback: (locationName: string) => void): void {
    if (!data.address) {
      callback(data.display_name);
      return;
    }

    const address = data.address;
    let formattedAddress = '';

    if (address.building || address.amenity || address.shop) {
      formattedAddress += address.building || address.amenity || address.shop;
      formattedAddress += ', ';
    }

    if (address.house_number && address.road) {
      formattedAddress += `${address.house_number} ${address.road}, `;
    } else if (address.road) {
      formattedAddress += `${address.road}, `;
    }

    if (address.neighbourhood || address.suburb) {
      formattedAddress += `${address.neighbourhood || address.suburb}, `;
    }

    if (address.city || address.town || address.village) {
      formattedAddress += address.city || address.town || address.village;
      
      if (address.postcode) {
        formattedAddress += ` ${address.postcode}`;
      }
      
      formattedAddress += ', ';
    }

    if (address.state || address.province) {
      formattedAddress += address.state || address.province;
      
      if (address.country) {
        formattedAddress += `, ${address.country}`;
      }
    } else if (address.country) {
      formattedAddress += address.country;
    }

    if (!formattedAddress || formattedAddress === ', ') {
      callback(data.display_name);
    } else {
      formattedAddress = formattedAddress.replace(/,\s*$/, '').replace(/\s{2,}/g, ' ');
      callback(formattedAddress);
    }
  }
}