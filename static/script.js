'use strict';

const API_BASE_URL = 'http://localhost:5000/api';
const cafe_id = document.URL.slice(document.URL.lastIndexOf('/') + 1);

/**
 *  If the current user likes this cafe, then show a filled star.
 *  Otherwise, show an empty star
 */
async function showCafeLikeStar() {
  const likeData = await fetch(`${API_BASE_URL}/likes?cafe_id=${cafe_id}`);
  const likeDataJSON = await likeData.json();
  const userLikesThisCafe = likeDataJSON.likes;

  if (userLikesThisCafe) {
    $('#like-star > i').addClass('bi bi-star-fill')
  } else {
    $('#like-star > i').addClass('bi bi-star');
  }

  const likeOrUnlike = userLikesThisCafe ? 'unlike' : 'like';
  $('#like-star > i').on('click', async function(e) {
    await fetch(`${API_BASE_URL}/${likeOrUnlike}`, {
        headers: {'Content-Type': 'application/json'},
        method: "POST",
        body: `{"cafe_id": ${cafe_id}}`}
    );
  });

  return userLikesThisCafe;
}

showCafeLikeStar();