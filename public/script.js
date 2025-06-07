// Global state
let activeFilters = [];
let currentQuery = {};
let currentResults = [];

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // No default query - leave textarea empty
    document.getElementById('queryInput').value = '';
});

// Execute the query from the textarea
async function executeQuery() {
    const queryInput = document.getElementById('queryInput').value.trim();
    const resultsDiv = document.getElementById('results');
    const resultsCount = document.getElementById('resultsCount');
    
    if (!queryInput) {
        resultsDiv.innerHTML = '<div class="error">Please enter a query</div>';
        return;
    }
    
    // Show loading state
    resultsDiv.innerHTML = '<div class="loading">🔍 Executing query...</div>';
    resultsCount.textContent = '';
    
    try {
        // Parse the JSON query first to catch JSON syntax errors
        let query;
        try {
            query = JSON.parse(queryInput);
        } catch (parseError) {
            throw new Error('Invalid query');
        }
        
        // Execute the search
        const response = await fetch('/api/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(query)
        });

        if (!response.ok) {
            throw new Error('Invalid query');
        }

        const data = await response.json();
        displayResults(data);
        
    } catch (error) {
        console.error('Query execution error:', error);
        
        resultsDiv.innerHTML = '<div class="error">Invalid query</div>';
        resultsCount.textContent = '';
    }
}

// Display search results
function displayResults(data) {
    const resultsDiv = document.getElementById('results');
    const resultsCount = document.getElementById('resultsCount');

    if (!data.movies || data.movies.length === 0) {
        resultsDiv.innerHTML = '<div class="no-results">No movies found matching your query.</div>';
        resultsCount.textContent = 'No results';
        return;
    }

    // Update results count
    resultsCount.textContent = `${data.movies.length} of ${data.totalCount} movies`;

    // Display movies
    resultsDiv.innerHTML = data.movies.map(movie => createMovieCard(movie)).join('');
}

// Create HTML for a movie card
function createMovieCard(movie) {
    // Helper function to safely get array values
    const getArrayValue = (value, maxItems = 3) => {
        if (!value) return null;
        if (Array.isArray(value)) {
            return value.slice(0, maxItems).join(', ');
        }
        return value;
    };
    
    // Helper function to check if field exists and has value
    const hasValue = (value) => {
        return value !== undefined && value !== null && value !== '';
    };
    
    // Create poster image HTML - always show poster area unless explicitly excluded
    let posterHtml;
    if (hasValue(movie.posterUrl)) {
        // Movie has a poster URL
        posterHtml = `<div class="movie-poster">
            <img src="${movie.posterUrl}" alt="${movie.title || 'Movie'} poster" 
                 onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'poster-placeholder\\'>📽️<br>No Image</div>'">
         </div>`;
    } else if (movie.hasOwnProperty('posterUrl')) {
        // posterUrl field is present but empty/null (was projected but has no value)
        posterHtml = `<div class="movie-poster">
            <div class="poster-placeholder">📽️<br>No Image</div>
         </div>`;
    } else {
        // posterUrl field was not projected - don't show poster area
        posterHtml = '';
    }
    
    // Build movie details dynamically based on available fields
    const details = [];
    
    if (hasValue(movie.director)) {
        const director = getArrayValue(movie.director);
        details.push(`<div><strong>Director:</strong> ${director}</div>`);
    }
    
    if (hasValue(movie.genre)) {
        details.push(`<div><strong>Genre:</strong> ${movie.genre}</div>`);
    }
    
    if (hasValue(movie.subgenre)) {
        details.push(`<div><strong>Subgenre:</strong> ${movie.subgenre}</div>`);
    }
    
    if (hasValue(movie.runtimeMinutes)) {
        details.push(`<div><strong>Runtime:</strong> ${movie.runtimeMinutes} min</div>`);
    }
    
    if (hasValue(movie.language)) {
        details.push(`<div><strong>Language:</strong> ${movie.language}</div>`);
    }
    
    if (hasValue(movie.country)) {
        details.push(`<div><strong>Country:</strong> ${movie.country}</div>`);
    }
    
    if (hasValue(movie.createdAt)) {
        details.push(`<div><strong>Release Date:</strong> ${movie.createdAt}</div>`);
    }
    
    if (hasValue(movie.releaseDate)) {
        details.push(`<div><strong>Upload date:</strong> ${movie.releaseDate}</div>`);
    }
    
    if (hasValue(movie.colorMode)) {
        details.push(`<div><strong>Color:</strong> ${movie.colorMode}</div>`);
    }
    
    if (hasValue(movie.rtScore)) {
        details.push(`<div><strong>RT Score:</strong> ${movie.rtScore}%</div>`);
    }
    
    if (hasValue(movie.metascore)) {
        details.push(`<div><strong>Metascore:</strong> ${movie.metascore}</div>`);
    }
    
    if (hasValue(movie.budget)) {
        details.push(`<div><strong>Budget:</strong> $${(movie.budget / 1000000).toFixed(1)}M</div>`);
    }
    
    if (hasValue(movie.revenue)) {
        details.push(`<div><strong>Revenue:</strong> $${(movie.revenue / 1000000).toFixed(1)}M</div>`);
    }
    
    if (hasValue(movie.profitMargin)) {
        details.push(`<div><strong>Profit Margin:</strong> ${movie.profitMargin}%</div>`);
    }
    
    if (hasValue(movie.awardWins)) {
        details.push(`<div><strong>Awards Won:</strong> ${movie.awardWins}</div>`);
    }
    
    if (hasValue(movie.awardNominations)) {
        details.push(`<div><strong>Award Nominations:</strong> ${movie.awardNominations}</div>`);
    }
    
    // Build meta tags dynamically
    const metaTags = [];
    
    if (hasValue(movie.genre)) {
        metaTags.push(`<span class="meta-tag genre-tag">${movie.genre}</span>`);
    }
    
    if (hasValue(movie.subgenre)) {
        metaTags.push(`<span class="meta-tag">${movie.subgenre}</span>`);
    }
    
    if (hasValue(movie.cast)) {
        const cast = getArrayValue(movie.cast);
        metaTags.push(`<span class="meta-tag">Cast: ${cast}</span>`);
    }
    
    if (movie.franchise === true) {
        metaTags.push('<span class="meta-tag">Franchise</span>');
    }
    
    if (hasValue(movie.revenue)) {
        metaTags.push(`<span class="meta-tag">Revenue: $${(movie.revenue / 1000000).toFixed(1)}M</span>`);
    }
    
    // Build the card HTML
    return `
        <div class="movie-card">
            ${posterHtml}
            <div class="movie-content">
                <div class="movie-header">
                    <div>
                        ${hasValue(movie.title) ? `<div class="movie-title">${movie.title}</div>` : '<div class="movie-title">Unknown Title</div>'}
                        ${hasValue(movie.creationYear) || hasValue(movie.releaseYear) ? `<div class="movie-year">${movie.creationYear || movie.releaseYear}</div>` : ''}
                        ${hasValue(movie.id) ? `<div class="movie-id">ID: ${movie.id}</div>` : ''}
                    </div>
                    <div class="movie-rating">
                        ${hasValue(movie.imdbRating) ? `<span class="imdb-rating">IMDb: ${movie.imdbRating}</span>` : ''}
                    </div>
                </div>
                
                ${details.length > 0 ? `<div class="movie-details">${details.join('')}</div>` : ''}
                
                ${hasValue(movie.synopsis) ? `<div class="movie-synopsis">${movie.synopsis}</div>` : ''}
                
                ${metaTags.length > 0 ? `<div class="movie-meta">${metaTags.join('')}</div>` : ''}
            </div>
        </div>
    `;
}

// Clear the query textarea and results
function clearQuery() {
    document.getElementById('queryInput').value = '';
    document.getElementById('results').innerHTML = '';
    document.getElementById('resultsCount').textContent = '';
}

// Handle Enter key in textarea (Ctrl+Enter to execute)
document.getElementById('queryInput').addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 'Enter') {
        executeQuery();
    }
}); 