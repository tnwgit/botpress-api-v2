/**
 * Utility functies voor het uploaden van bestanden
 */

// Functie voor het uploaden van bestanden naar de server
function uploadFile(file, type, callback) {
    console.log(`Bestand uploaden: ${file.name}, type: ${type}`);
    
    // Maak een FormData object om het bestand te versturen
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    
    // Haal auth token op
    const authToken = localStorage.getItem('auth-token');
    
    // Stuur bestand naar de server
    fetch('/api/upload', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authToken}`
        },
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log(`Upload succesvol, URL: ${data.url}`);
        callback(data.url);
    })
    .catch(error => {
        console.error(`Fout bij uploaden: ${error.message}`);
        // Als er een log functie beschikbaar is, gebruik die ook
        if (typeof log === 'function') {
            log(`Fout bij uploaden: ${error.message}`, 'error');
        }
        
        // Als er een showNotification functie beschikbaar is, gebruik die ook
        if (typeof showNotification === 'function') {
            showNotification(`Fout bij uploaden: ${error.message}`, 'error');
        }
        
        callback(null);
    });
} 