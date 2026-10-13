// 1. Define Configuration First
// API Configuration
// The backend service URL will be automatically configured after deployment.
// If this is empty after deployment, check Railway dashboard:
// Service → Settings → Domains to get your service URL.
const CONFIG = {
    API_URL: ""
};

// Ensure CONFIG is globally accessible
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
}

// SKILL-IN SYSTEM: REQUIRED CODE - DO NOT MODIFY
// --- MENTOR TRACKING START ---
(function() {
    // Extract boardId from API_URL pattern: https://webapi{boardId}.railway.app (no hyphen)
    function getBoardId() {
        // Try to extract from CONFIG.API_URL pattern: https://webapi{boardId}.railway.app
        // Fixed Regex: Removed the hyphen after 'webapi' to match actual Railway URL pattern
        const apiUrl = (typeof CONFIG !== 'undefined' && CONFIG?.API_URL) ? CONFIG.API_URL : '';
        if (apiUrl) {
            const match = apiUrl.match(/webapi([a-f0-9]{24})/i);
            if (match && match[1]) {
                return match[1];
            }
        }
        
        // No fallback - if CONFIG.API_URL is not available or doesn't contain boardId, return null
        // This prevents logging with incorrect boardIds
        console.warn('Mentor tracking: CONFIG.API_URL not available or does not contain valid boardId pattern');
        return null;
    }
    
    // Get Mentor API base URL (StrAppers backend) for error logging
    function getMentorApiBaseUrl() {
        // Use configured Mentor API URL if available, otherwise fallback to current origin
        return "https://skill-in-backend-dvdmgbe7fmhmg4hp.eastus2-01.azurewebsites.net";
    }
    
    // Log successful page load (fires after page is fully loaded)
    // Delay to ensure CONFIG is loaded from config.js
    window.addEventListener('load', function() {
        // Wait a bit for config.js to load if it's loaded asynchronously
        setTimeout(function() {
            const boardId = getBoardId();
            if (!boardId) {
                console.warn('Mentor tracking: BoardId not found, skipping success log. CONFIG.API_URL may not be loaded yet.');
                return;
            }
            
            const mentorApiBaseUrl = getMentorApiBaseUrl();
            const frontendLogEndpoint = mentorApiBaseUrl + '/api/Mentor/runtime-error-frontend';
            
            fetch(frontendLogEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    boardId: boardId,
                    type: 'FRONTEND_SUCCESS',
                    timestamp: new Date().toISOString(),
                    message: 'Frontend page loaded successfully'
                })
            }).catch(err => console.warn("Mentor success log failed", err));
        }, 100); // Small delay to ensure config.js is loaded
    });
    
    // Catch JavaScript errors
    window.onerror = function(message, source, lineno, colno, error) {
        const boardId = getBoardId();
        if (!boardId) {
            console.warn('Mentor tracking: BoardId not found, skipping error log. CONFIG.API_URL:', 
                (typeof CONFIG !== 'undefined' && CONFIG?.API_URL) ? CONFIG.API_URL : 'CONFIG not defined');
            return false;
        }
        
        console.log('Mentor tracking: Logging runtime error with boardId:', boardId);
        
        const mentorApiBaseUrl = getMentorApiBaseUrl();
        const frontendLogEndpoint = mentorApiBaseUrl + '/api/Mentor/runtime-error-frontend';
        
        const payload = {
            boardId: boardId,
            type: 'FRONTEND_RUNTIME',
            message: message || 'Unknown error',
            file: source || 'Unknown',
            line: lineno || null,
            column: colno || null,
            stack: error ? error.stack : 'N/A',
            timestamp: new Date().toISOString()
        };

        fetch(frontendLogEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(response => {
            if (!response.ok) {
                console.warn('Mentor error log failed:', response.status, response.statusText);
            }
        }).catch(err => console.warn("Mentor error log failed", err));

        return false; // Allows the error to still appear in the browser console
    };

    // Catch unhandled promise rejections (failed API calls)
    window.onunhandledrejection = function(event) {
        const boardId = getBoardId();
        if (!boardId) {
            console.warn('Mentor tracking: BoardId not found, skipping promise rejection log');
            return;
        }
        
        const mentorApiBaseUrl = getMentorApiBaseUrl();
        const frontendLogEndpoint = mentorApiBaseUrl + '/api/Mentor/runtime-error-frontend';
        
        const payload = {
            boardId: boardId,
            type: 'FRONTEND_PROMISE_REJECTION',
            message: event.reason?.message || String(event.reason) || 'Unhandled promise rejection',
            stack: event.reason?.stack || 'N/A',
            timestamp: new Date().toISOString()
        };

        fetch(frontendLogEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(err => console.warn("Mentor promise rejection log failed", err));
    };
})();
// --- MENTOR TRACKING END ---
