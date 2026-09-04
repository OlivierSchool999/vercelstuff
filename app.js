
/*
=========================================================
 MY SPOTIFY
 Full Spotify Web App
=========================================================

 Client ID:
 e9a02e5d46434f67b9cd8f7c45083003

 Gebruik NOOIT je Client Secret in deze frontend.

 Features:
 - Spotify PKCE login
 - Liked Songs
 - User playlists
 - Playlist tracks
 - Search
 - Web Playback SDK
 - Play / Pause
 - Previous / Next
 - Volume
 - Seek
=========================================================
*/


// ======================================================
// CONFIG
// ======================================================

const CLIENT_ID =
  "e9a02e5d46434f67b9cd8f7c45083003";


const REDIRECT_URI =
  window.location.origin +
  window.location.pathname;


const SCOPES = [
  "streaming",

  "user-read-email",

  "user-read-private",

  "user-read-playback-state",

  "user-modify-playback-state",

  "user-library-read",

  "playlist-read-private",

  "playlist-read-collaborative"
].join(" ");


// ======================================================
// STATE
// ======================================================

let accessToken = null;

let spotifyPlayer = null;

let deviceId = null;

let currentTrack = null;

let playerReady = false;

let currentPage = "home";

let playlistsLoaded = false;

let likedLoaded = false;


// ======================================================
// HELPERS
// ======================================================

function $(id) {
  return document.getElementById(id);
}


function escapeHtml(value) {

  const div =
    document.createElement("div");

  div.textContent =
    value ?? "";

  return div.innerHTML;
}


function showToast(message) {

  const toast =
    $("toast");

  if (!toast) return;

  toast.textContent =
    message;

  toast.classList.remove(
    "hidden"
  );

  clearTimeout(
    window.toastTimer
  );

  window.toastTimer =
    setTimeout(() => {

      toast.classList.add(
        "hidden"
      );

    }, 3000);
}


function formatTime(ms) {

  if (!ms) {
    return "0:00";
  }

  const totalSeconds =
    Math.floor(ms / 1000);

  const minutes =
    Math.floor(
      totalSeconds / 60
    );

  const seconds =
    totalSeconds % 60;

  return (
    minutes +
    ":" +
    String(seconds)
      .padStart(2, "0")
  );
}


// ======================================================
// PKCE
// ======================================================

function randomString(length = 64) {

  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
    "abcdefghijklmnopqrstuvwxyz" +
    "0123456789-._~";

  const values =
    new Uint8Array(length);

  crypto.getRandomValues(
    values
  );

  return Array.from(values)
    .map(
      value =>
        characters[
          value % characters.length
        ]
    )
    .join("");
}


async function sha256(value) {

  return crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
}


function base64UrlEncode(buffer) {

  return btoa(
    String.fromCharCode(
      ...new Uint8Array(buffer)
    )
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}


async function createCodeChallenge(
  verifier
) {

  const hash =
    await sha256(verifier);

  return base64UrlEncode(hash);
}


// ======================================================
// LOGIN
// ======================================================

async function login() {

  const verifier =
    randomString(64);

  const challenge =
    await createCodeChallenge(
      verifier
    );

  const state =
    randomString(32);


  localStorage.setItem(
    "spotify_code_verifier",
    verifier
  );

  localStorage.setItem(
    "spotify_state",
    state
  );


  const params =
    new URLSearchParams({

      client_id:
        CLIENT_ID,

      response_type:
        "code",

      redirect_uri:
        REDIRECT_URI,

      scope:
        SCOPES,

      state,

      code_challenge_method:
        "S256",

      code_challenge:
        challenge
    });


  window.location.href =
    "https://accounts.spotify.com/authorize?" +
    params.toString();
}


// ======================================================
// CALLBACK
// ======================================================

async function handleCallback() {

  const params =
    new URLSearchParams(
      window.location.search
    );


  const code =
    params.get("code");

  const state =
    params.get("state");

  const error =
    params.get("error");


  if (error) {

    console.error(
      "Spotify OAuth error:",
      error
    );

    showToast(
      "Spotify login geannuleerd."
    );

    return;
  }


  if (!code) {
    return;
  }


  const savedState =
    localStorage.getItem(
      "spotify_state"
    );


  if (
    !savedState ||
    savedState !== state
  ) {

    console.error(
      "OAuth state mismatch."
    );

    showToast(
      "Spotify security check mislukt."
    );

    return;
  }


  const verifier =
    localStorage.getItem(
      "spotify_code_verifier"
    );


  if (!verifier) {

    showToast(
      "PKCE verifier ontbreekt."
    );

    return;
  }


  const body =
    new URLSearchParams({

      client_id:
        CLIENT_ID,

      grant_type:
        "authorization_code",

      code,

      redirect_uri:
        REDIRECT_URI,

      code_verifier:
        verifier
    });


  const response =
    await fetch(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },

        body
      }
    );


  const data =
    await response.json();


  if (!response.ok) {

    console.error(
      "Token response:",
      data
    );

    showToast(
      "Spotify login mislukt."
    );

    return;
  }


  saveTokens(data);


  localStorage.removeItem(
    "spotify_code_verifier"
  );

  localStorage.removeItem(
    "spotify_state"
  );


  window.history.replaceState(
    {},
    document.title,
    window.location.pathname
  );
}


// ======================================================
// TOKENS
// ======================================================

function saveTokens(data) {

  if (data.access_token) {

    accessToken =
      data.access_token;

    localStorage.setItem(
      "spotify_access_token",
      data.access_token
    );
  }


  if (data.refresh_token) {

    localStorage.setItem(
      "spotify_refresh_token",
      data.refresh_token
    );
  }


  if (data.expires_in) {

    const expiresAt =
      Date.now() +
      data.expires_in * 1000;

    localStorage.setItem(
      "spotify_expires_at",
      String(expiresAt)
    );
  }
}


async function refreshAccessToken() {

  const refreshToken =
    localStorage.getItem(
      "spotify_refresh_token"
    );


  if (!refreshToken) {
    return false;
  }


  const body =
    new URLSearchParams({

      grant_type:
        "refresh_token",

      refresh_token:
        refreshToken,

      client_id:
        CLIENT_ID
    });


  const response =
    await fetch(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },

        body
      }
    );


  const data =
    await response.json();


  if (!response.ok) {

    console.error(
      "Refresh error:",
      data
    );

    return false;
  }


  saveTokens(data);

  return true;
}


async function getToken() {

  const expiresAt =
    Number(
      localStorage.getItem(
        "spotify_expires_at"
      ) || 0
    );


  if (
    accessToken &&
    Date.now() <
      expiresAt - 60000
  ) {

    return accessToken;
  }


  accessToken =
    localStorage.getItem(
      "spotify_access_token"
    );


  if (
    accessToken &&
    Date.now() <
      expiresAt - 60000
  ) {

    return accessToken;
  }


  const refreshed =
    await refreshAccessToken();


  if (refreshed) {
    return accessToken;
  }


  return null;
}


// ======================================================
// API
// ======================================================

async function spotifyFetch(
  url,
  options = {}
) {

  let token =
    await getToken();


  if (!token) {

    throw new Error(
      "Niet ingelogd."
    );
  }


  const headers = {

    ...(options.headers || {}),

    Authorization:
      `Bearer ${token}`
  };


  let response =
    await fetch(
      url,
      {
        ...options,
        headers
      }
    );


  if (response.status === 401) {

    const refreshed =
      await refreshAccessToken();


    if (!refreshed) {

      logout();

      throw new Error(
        "Spotify sessie verlopen."
      );
    }


    token =
      await getToken();


    headers.Authorization =
      `Bearer ${token}`;


    response =
      await fetch(
        url,
        {
          ...options,
          headers
        }
      );
  }


  return response;
}


// ======================================================
// PROFILE
// ======================================================

async function loadProfile() {

  try {

    const response =
      await spotifyFetch(
        "https://api.spotify.com/v1/me"
      );


    if (!response.ok) {
      return;
    }


    const profile =
      await response.json();


    $("userName").textContent =
      profile.display_name ||
      profile.id;

  } catch (error) {

    console.error(
      "Profile:",
      error
    );
  }
}


// ======================================================
// PLAYLISTS
// ======================================================

async function loadPlaylists() {

  if (playlistsLoaded) {
    return;
  }


  const container =
    $("playlistList");


  container.innerHTML =
    `
    <div class="loading-small">
      Playlists laden...
    </div>
    `;


  try {

    let offset = 0;

    const allPlaylists = [];


    while (true) {

      const response =
        await spotifyFetch(
          "https://api.spotify.com/v1/me/playlists?" +
          new URLSearchParams({

            limit: "50",

            offset:
              String(offset)
          })
        );


      if (!response.ok) {

        throw new Error(
          await response.text()
        );
      }


      const data =
        await response.json();


      allPlaylists.push(
        ...(data.items || [])
      );


      if (
        !data.next ||
        !data.items?.length
      ) {

        break;
      }


      offset +=
        data.items.length;
    }


    renderPlaylists(
      allPlaylists
    );


    playlistsLoaded =
      true;

  } catch (error) {

    console.error(
      "Playlists:",
      error
    );


    container.innerHTML =
      `
      <div class="loading-small">
        Playlists konden niet worden geladen.
      </div>
      `;
  }
}


function renderPlaylists(
  playlists
) {

  const container =
    $("playlistList");


  container.innerHTML = "";


  if (!playlists.length) {

    container.innerHTML =
      `
      <div class="loading-small">
        Geen playlists gevonden.
      </div>
      `;

    return;
  }


  playlists.forEach(
    playlist => {

      const button =
        document.createElement(
          "button"
        );


      button.className =
        "playlist-button";


      const image =
        playlist.images?.[0]?.url ||
        "";


      button.innerHTML =
        `
        <img
          src="${escapeHtml(image)}"
          alt=""
        >

        <span>
          ${escapeHtml(
            playlist.name
          )}
        </span>
        `;


      button.addEventListener(
        "click",
        () => {

          openPlaylist(
            playlist
          );
        }
      );


      container.appendChild(
        button
      );
    }
  );
}


// ======================================================
// OPEN PLAYLIST
// ======================================================

async function openPlaylist(
  playlist
) {

  showPage(
    "playlist"
  );


  $("playlistTitle")
    .textContent =
      playlist.name;


  $("playlistDescription")
    .textContent =
      playlist.description || "";


  $("playlistImage").src =
    playlist.images?.[0]?.url ||
    "";


  const container =
    $("playlistTracks");


  container.innerHTML =
    `
    <div class="loading">
      Nummers laden...
    </div>
    `;


  try {

    let offset = 0;

    const tracks = [];


    while (true) {

      const response =
        await spotifyFetch(
          `https://api.spotify.com/v1/playlists/${encodeURIComponent(
            playlist.id
          )}/items?` +
          new URLSearchParams({

            limit: "50",

            offset:
              String(offset)
          })
        );


      if (!response.ok) {

        throw new Error(
          await response.text()
        );
      }


      const data =
        await response.json();


      tracks.push(
        ...(data.items || [])
      );


      if (
        !data.next ||
        !data.items?.length
      ) {

        break;
      }


      offset +=
        data.items.length;
    }


    renderTracks(
      tracks
        .map(
          item => ({
            track: item.item || item.track
          })
        )
        .filter(
          item =>
            item.track &&
            item.track.type === "track"
        )
    );

  } catch (error) {

    console.error(
      "Playlist tracks:",
      error
    );


    container.innerHTML =
      `
      <div class="loading">
        Playlist kon niet worden geladen.
      </div>
      `;
  }
}


// ======================================================
// LIKED SONGS
// ======================================================

async function loadLikedSongs() {

  if (likedLoaded) {
    return;
  }


  const container =
    $("likedTracks");


  container.innerHTML =
    `
    <div class="loading">
      Liked Songs laden...
    </div>
    `;


  try {

    let offset = 0;

    const items = [];


    while (true) {

      const response =
        await spotifyFetch(
          "https://api.spotify.com/v1/me/tracks?" +
          new URLSearchParams({

            limit: "50",

            offset:
              String(offset)
          })
        );


      if (!response.ok) {

        throw new Error(
          await response.text()
        );
      }


      const data =
        await response.json();


      items.push(
        ...(data.items || [])
      );


      if (
        !data.next ||
        !data.items?.length
      ) {

        break;
      }


      offset +=
        data.items.length;
    }


    $("likedCount").textContent =
      `${items.length} nummers`;


    renderTracks(
      items
    );


    likedLoaded =
      true;

  } catch (error) {

    console.error(
      "Liked Songs:",
      error
    );


    container.innerHTML =
      `
      <div class="loading">
        Liked Songs konden niet worden geladen.
      </div>
      `;
  }
}


// ======================================================
// RENDER TRACKS
// ======================================================

function renderTracks(
  items,
  target = null
) {

  const container =
    target ||
    (
      currentPage === "liked"
        ? $("likedTracks")
        : $("playlistTracks")
    );


  if (!container) {
    return;
  }


  container.innerHTML = "";


  if (!items.length) {

    container.innerHTML =
      `
      <div class="loading">
        Geen nummers gevonden.
      </div>
      `;

    return;
  }


  items.forEach(
    (item, index) => {

      const track =
        item.track ||
        item;


      if (
        !track ||
        !track.uri
      ) {

        return;
      }


      const row =
        document.createElement(
          "div"
        );


      row.className =
        "track";


      const image =
        track.album?.images?.[1]?.url ||
        track.album?.images?.[0]?.url ||
        "";


      const artists =
        track.artists
          ?.map(
            artist =>
              artist.name
          )
          .join(", ") ||
        "Onbekende artiest";


      row.innerHTML =
        `
        <div class="track-number">
          ${index + 1}
        </div>

        <img
          class="track-cover"
          src="${escapeHtml(image)}"
          alt=""
        >

        <div class="track-details">

          <span class="track-title">
            ${escapeHtml(
              track.name
            )}
          </span>

          <span class="track-artist">
            ${escapeHtml(
              artists
            )}
          </span>

        </div>

        <button
          class="track-play"
          title="Afspelen"
        >
          ▶
        </button>
        `;


      row
        .querySelector(
          ".track-play"
        )
        .addEventListener(
          "click",
          () => {

            playTrack(
              track.uri
            );
          }
        );


      container.appendChild(
        row
      );
    }
  );
}


// ======================================================
// SEARCH
// ======================================================

async function searchTracks() {

  const query =
    $("searchInput")
      .value
      .trim();


  if (!query) {
    return;
  }


  showPage(
    "search"
  );


  const container =
    $("searchPageResults");


  container.innerHTML =
    `
    <div class="loading">
      Zoeken...
    </div>
    `;


  try {

    const url =
      "https://api.spotify.com/v1/search?" +
      new URLSearchParams({

        q: query,

        type: "track",

        limit: "50"
      });


    const response =
      await spotifyFetch(
        url
      );


    if (!response.ok) {

      throw new Error(
        await response.text()
      );
    }


    const data =
      await response.json();


    renderTracks(
      data.tracks?.items || [],
      container
    );

  } catch (error) {

    console.error(
      "Search:",
      error
    );


    container.innerHTML =
      `
      <div class="loading">
        Zoeken mislukt.
      </div>
      `;
  }
}


// ======================================================
// SHOW PAGE
// ======================================================

function showPage(page) {

  currentPage =
    page;


  const pages = [
    "homePage",
    "likedPage",
    "playlistPage",
    "searchPage"
  ];


  pages.forEach(
    id => {

      $(id)
        ?.classList
        .add("hidden");
    }
  );


  if (page === "home") {

    $("homePage")
      .classList
      .remove("hidden");
  }


  if (page === "liked") {

    $("likedPage")
      .classList
      .remove("hidden");

    loadLikedSongs();
  }


  if (page === "playlist") {

    $("playlistPage")
      .classList
      .remove("hidden");
  }


  if (page === "search") {

    $("searchPage")
      .classList
      .remove("hidden");
  }


  document
    .querySelectorAll(
      ".nav-item"
    )
    .forEach(
      button => {

        button.classList.toggle(
          "active",
          button.dataset.page === page
        );
      }
    );
}


// ======================================================
// SPOTIFY WEB PLAYER
// ======================================================

async function initializePlayer() {

  if (spotifyPlayer) {
    return;
  }


  const token =
    await getToken();


  if (!token) {
    return;
  }


  if (!window.Spotify) {

    console.error(
      "Spotify SDK niet geladen."
    );

    showToast(
      "Spotify player SDK is niet geladen."
    );

    return;
  }


  console.log(
    "Starting Spotify Web Playback SDK..."
  );


  spotifyPlayer =
    new Spotify.Player({

      name:
        "My Spotify Web Player",

      volume:
        0.7,

      getOAuthToken:
        async callback => {

          const freshToken =
            await getToken();

          callback(
            freshToken
          );
        }
    });


  // ----------------------------------------------------
  // READY
  // ----------------------------------------------------

  spotifyPlayer.addListener(
    "ready",
    ({ device_id }) => {

      deviceId =
        device_id;

      playerReady =
        true;


      console.log(
        "Spotify browser device ready:",
        deviceId
      );


      showToast(
        "Webplayer klaar ✓"
      );
    }
  );


  // ----------------------------------------------------
  // NOT READY
  // ----------------------------------------------------

  spotifyPlayer.addListener(
    "not_ready",
    ({ device_id }) => {

      console.log(
        "Spotify device offline:",
        device_id
      );


      if (
        device_id ===
        deviceId
      ) {

        deviceId =
          null;

        playerReady =
          false;
      }
    }
  );


  // ----------------------------------------------------
  // PLAYER STATE
  // ----------------------------------------------------

  spotifyPlayer.addListener(
    "player_state_changed",
    state => {

      if (!state) {
        return;
      }


      currentTrack =
        state
          .track_window
          .current_track;


      if (currentTrack) {

        updatePlayerUI(
          currentTrack
        );
      }


      $("playBtn").textContent =
        state.paused
          ? "▶"
          : "Ⅱ";


      $("progress").value =
        state.duration
          ? (
              state.position /
              state.duration
            ) * 100
          : 0;


      $("currentTime")
        .textContent =
          formatTime(
            state.position
          );


      $("duration")
        .textContent =
          formatTime(
            state.duration
          );
    }
  );


  // ----------------------------------------------------
  // AUTOPLAY
  // ----------------------------------------------------

  spotifyPlayer.addListener(
    "autoplay_failed",
    () => {

      showToast(
        "Klik nogmaals op play om het nummer te starten."
      );
    }
  );


  // ----------------------------------------------------
  // ERRORS
  // ----------------------------------------------------

  spotifyPlayer.addListener(
    "initialization_error",
    ({ message }) => {

      console.error(
        "Initialization:",
        message
      );


      showToast(
        "Spotify player kon niet worden gestart."
      );
    }
  );


  spotifyPlayer.addListener(
    "authentication_error",
    ({ message }) => {

      console.error(
        "Authentication:",
        message
      );


      showToast(
        "Spotify authenticatie mislukt."
      );
    }
  );


  spotifyPlayer.addListener(
    "account_error",
    ({ message }) => {

      console.error(
        "Account:",
        message
      );


      showToast(
        "Spotify Premium is nodig voor Web Playback."
      );
    }
  );


  spotifyPlayer.addListener(
    "playback_error",
    ({ message }) => {

      console.error(
        "Playback:",
        message
      );


      showToast(
        "Spotify kon dit nummer niet afspelen."
      );
    }
  );


  // ----------------------------------------------------
  // CONNECT
  // ----------------------------------------------------

  const connected =
    await spotifyPlayer.connect();


  if (!connected) {

    console.error(
      "Spotify player connection failed."
    );

    return;
  }


  console.log(
    "Spotify Web Playback connected."
  );
}


// ======================================================
// WAIT FOR PLAYER DEVICE
// ======================================================

function waitForPlayer(
  timeout = 15000
) {

  return new Promise(
    resolve => {

      if (deviceId) {

        resolve(true);

        return;
      }


      const start =
        Date.now();


      const interval =
        setInterval(
          () => {

            if (deviceId) {

              clearInterval(
                interval
              );

              resolve(true);

              return;
            }


            if (
              Date.now() -
              start >=
              timeout
            ) {

              clearInterval(
                interval
              );

              resolve(false);
            }

          },
          200
        );
    }
  );
}


// ======================================================
// PLAY TRACK
// ======================================================

async function playTrack(
  uri
) {

  if (!uri) {
    return;
  }


  /*
    Very important:

    This is a user interaction,
    so activateElement() helps browsers
    allow audio playback.
  */

  if (spotifyPlayer) {

    try {

      await spotifyPlayer
        .activateElement();

    } catch (error) {

      console.log(
        "activateElement:",
        error
      );
    }
  }


  if (!spotifyPlayer) {

    await initializePlayer();
  }


  if (!spotifyPlayer) {

    showToast(
      "Spotify player is niet beschikbaar."
    );

    return;
  }


  const ready =
    await waitForPlayer();


  if (!ready) {

    showToast(
      "Webplayer wordt nog gestart..."
    );

    return;
  }


  try {

    const token =
      await getToken();


    if (!token) {

      logout();

      return;
    }


    /*
      This tells Spotify to use OUR
      browser Web Playback device.
    */

    const response =
      await fetch(
        "https://api.spotify.com/v1/me/player/play" +
        "?device_id=" +
        encodeURIComponent(
          deviceId
        ),
        {

          method: "PUT",

          headers: {

            Authorization:
              `Bearer ${token}`,

            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              uris: [uri]
            })
        }
      );


    if (!response.ok) {

      const text =
        await response.text();

      console.error(
        "Playback response:",
        response.status,
        text
      );


      showToast(
        "Spotify kon dit nummer niet starten."
      );

      return;
    }


    console.log(
      "Playing in browser:",
      uri
    );

  } catch (error) {

    console.error(
      "Play:",
      error
    );


    showToast(
      "Afspelen mislukt."
    );
  }
}


// ======================================================
// UPDATE PLAYER
// ======================================================

function updatePlayerUI(
  track
) {

  if (!track) {
    return;
  }


  $("trackName")
    .textContent =
      track.name;


  $("artistName")
    .textContent =
      track.artists
        ?.map(
          artist =>
            artist.name
        )
        .join(", ") ||
      "";


  $("trackImage").src =
    track.album?.images?.[1]?.url ||
    track.album?.images?.[0]?.url ||
    "";
}


// ======================================================
// PLAYER CONTROLS
// ======================================================

async function togglePlay() {

  if (!spotifyPlayer) {

    await initializePlayer();
  }


  if (!spotifyPlayer) {
    return;
  }


  try {

    await spotifyPlayer
      .activateElement();

  } catch (error) {
    console.log(error);
  }


  try {

    await spotifyPlayer
      .togglePlay();

  } catch (error) {

    console.error(
      "Toggle:",
      error
    );
  }
}


async function nextTrack() {

  if (!spotifyPlayer) {
    return;
  }


  try {

    await spotifyPlayer
      .nextTrack();

  } catch (error) {

    console.error(
      "Next:",
      error
    );
  }
}


async function previousTrack() {

  if (!spotifyPlayer) {
    return;
  }


  try {

    await spotifyPlayer
      .previousTrack();

  } catch (error) {

    console.error(
      "Previous:",
      error
    );
  }
}


async function changeVolume(
  value
) {

  if (!spotifyPlayer) {
    return;
  }


  try {

    await spotifyPlayer
      .setVolume(
        Number(value) / 100
      );

  } catch (error) {

    console.error(
      "Volume:",
      error
    );
  }
}


async function seek(
  percentage
) {

  if (!spotifyPlayer) {
    return;
  }


  const state =
    spotifyPlayer
      .getCurrentState();


  if (!state) {
    return;
  }


  const position =
    (
      Number(percentage) /
      100
    ) *
    state.duration;


  try {

    await spotifyPlayer
      .seek(position);

  } catch (error) {

    console.error(
      "Seek:",
      error
    );
  }
}


// ======================================================
// LOGOUT
// ======================================================

function logout() {

  try {

    if (spotifyPlayer) {

      spotifyPlayer
        .disconnect();
    }

  } catch (error) {

    console.error(
      error
    );
  }


  localStorage.removeItem(
    "spotify_access_token"
  );

  localStorage.removeItem(
    "spotify_refresh_token"
  );

  localStorage.removeItem(
    "spotify_expires_at"
  );

  localStorage.removeItem(
    "spotify_code_verifier"
  );

  localStorage.removeItem(
    "spotify_state"
  );


  accessToken =
    null;

  spotifyPlayer =
    null;

  deviceId =
    null;

  playerReady =
    false;

  playlistsLoaded =
    false;

  likedLoaded =
    false;


  window.location.reload();
}


// ======================================================
// EVENTS
// ======================================================

function setupEvents() {

  // Login
  $("loginBtn")
    ?.addEventListener(
      "click",
      login
    );


  $("loginBtn2")
    ?.addEventListener(
      "click",
      login
    );


  // Logout
  $("logoutBtn")
    ?.addEventListener(
      "click",
      logout
    );


  // Search
  $("searchBtn")
    ?.addEventListener(
      "click",
      searchTracks
    );


  $("searchInput")
    ?.addEventListener(
      "keydown",
      event => {

        if (
          event.key ===
          "Enter"
        ) {

          searchTracks();
        }
      }
    );


  // Main navigation
  document
    .querySelectorAll(
      ".nav-item"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            showPage(
              button.dataset.page
            );
          }
        );
      }
    );


  // Liked card
  document
    .querySelectorAll(
      ".library-card[data-page]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            showPage(
              button.dataset.page
            );
          }
        );
      }
    );


  // Open playlists
  $("openPlaylists")
    ?.addEventListener(
      "click",
      async () => {

        await loadPlaylists();

        showToast(
          "Je playlists staan links."
        );
      }
    );


  // Back
  $("backHome")
    ?.addEventListener(
      "click",
      () => {

        showPage(
          "home"
        );
      }
    );


  // Player
  $("playBtn")
    ?.addEventListener(
      "click",
      togglePlay
    );


  $("nextBtn")
    ?.addEventListener(
      "click",
      nextTrack
    );


  $("previousBtn")
    ?.addEventListener(
      "click",
      previousTrack
    );


  $("volume")
    ?.addEventListener(
      "input",
      event => {

        changeVolume(
          event.target.value
        );
      }
    );


  $("progress")
    ?.addEventListener(
      "change",
      event => {

        seek(
          event.target.value
        );
      }
    );
}


// ======================================================
// UI LOGIN STATE
// ======================================================

function showLoggedIn() {

  $("loginScreen")
    ?.classList
    .add("hidden");


  $("appScreen")
    ?.classList
    .remove("hidden");


  $("playerBar")
    ?.classList
    .remove("hidden");


  $("loginBtn")
    ?.classList
    .add("hidden");


  $("logoutBtn")
    ?.classList
    .remove("hidden");
}


function showLoggedOut() {

  $("loginScreen")
    ?.classList
    .remove("hidden");


  $("appScreen")
    ?.classList
    .add("hidden");


  $("playerBar")
    ?.classList
    .add("hidden");


  $("loginBtn")
    ?.classList
    .remove("hidden");


  $("logoutBtn")
    ?.classList
    .add("hidden");
}


// ======================================================
// INITIALIZATION
// ======================================================

async function init() {

  console.log(
    "My Spotify starting..."
  );


  setupEvents();


  // OAuth callback
  await handleCallback();


  // Token
  accessToken =
    await getToken();


  if (!accessToken) {

    showLoggedOut();

    return;
  }


  // UI
  showLoggedIn();


  // User
  await loadProfile();


  // Playlists
  await loadPlaylists();


  /*
    The SDK script is loaded before app.js
    in index.html.

    Wait a moment just in case the browser
    hasn't exposed window.Spotify yet.
  */

  if (
    window.Spotify
  ) {

    await initializePlayer();

  } else {

    let attempts = 0;

    const sdkTimer =
      setInterval(
        async () => {

          attempts++;


          if (
            window.Spotify
          ) {

            clearInterval(
              sdkTimer
            );

            await initializePlayer();

            return;
          }


          if (
            attempts >= 50
          ) {

            clearInterval(
              sdkTimer
            );

            showToast(
              "Spotify Web Playback SDK kon niet laden."
            );
          }

        },
        200
      );
  }
}


// ======================================================
// START
// ======================================================

init();
