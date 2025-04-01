/**
 * Auth helpers voor het toevoegen van de JWT token aan fetch requests
 */

// Functie om een token-header toe te voegen aan fetch requests
function addAuthorizationHeader(headers = {}) {
    const token = localStorage.getItem('auth-token');
    if (token) {
        return {
            ...headers,
            'Authorization': `Bearer ${token}`
        };
    }
    return headers;
}

// Functie om te controleren of de gebruiker is ingelogd
async function isAuthenticated() {
    try {
        const response = await fetch('/api/auth/check', {
            method: 'GET',
            credentials: 'include',
            headers: addAuthorizationHeader({
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            })
        });
        
        if (!response.ok) {
            return false;
        }
        
        const data = await response.json();
        return data.isAuthenticated;
    } catch (error) {
        console.error('Auth check error:', error);
        return false;
    }
}

// Functie om de huidige gebruiker op te halen
function getCurrentUser() {
    const userStr = localStorage.getItem('user');
    if (userStr) {
        try {
            return JSON.parse(userStr);
        } catch (e) {
            console.error('Error parsing user data:', e);
        }
    }
    return null;
}

// Functie om de gebruiker uit te loggen
async function logout() {
    // Verwijder lokale opslag
    localStorage.removeItem('auth-token');
    localStorage.removeItem('user');
    
    // Logout op server
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include'
        });
    } catch (error) {
        console.error('Logout error:', error);
    }
    
    // Redirect naar login pagina
    window.location.href = '/login.html';
}

// Voeg automatisch de auth header toe aan alle fetch requests
const originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
    // Alleen toepassen op relatieve URLs of URLs naar dezelfde origin
    if (url.startsWith('/') || url.startsWith(window.location.origin)) {
        options = options || {};
        options.headers = options.headers || {};
        options.headers = addAuthorizationHeader(options.headers);
    }
    return originalFetch(url, options);
}; 