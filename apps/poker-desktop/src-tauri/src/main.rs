// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use tauri::Manager;
use keyring::Entry;
use chrono::{DateTime, Utc, Duration};
use reqwest::{Client, header};

#[derive(Debug, Serialize, Deserialize)]
struct ConnectionStatus {
    connected: bool,
    backend_url: String,
    latency_ms: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
struct AuthToken {
    access_token: String,
    refresh_token: String,
    expires_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct LoginResponse {
    user: User,
    tokens: TokenResponse,
    message: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct TokenResponse {
    #[serde(rename = "accessToken")]
    access_token: String,
    #[serde(rename = "refreshToken")]
    refresh_token: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct User {
    id: String,
    username: String,
    email: String,
    name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ApiResponse<T> {
    success: bool,
    data: Option<T>,
    error: Option<ApiError>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ApiError {
    message: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct TableConfig {
    name: String,
    #[serde(rename = "gameType")]
    game_type: String,
    #[serde(rename = "bettingStructure")]
    betting_structure: String,
    #[serde(rename = "gameFormat")]
    game_format: String,
    #[serde(rename = "maxPlayers")]
    max_players: u8,
    #[serde(rename = "minBuyIn")]
    min_buy_in: u32,
    #[serde(rename = "maxBuyIn")]
    max_buy_in: u32,
    #[serde(rename = "smallBlind")]
    small_blind: u32,
    #[serde(rename = "bigBlind")]
    big_blind: u32,
    ante: u32,
    #[serde(rename = "timeBank")]
    time_bank: u32,
    #[serde(rename = "isPrivate")]
    is_private: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct Table {
    id: String,
    name: String,
    #[serde(rename = "playerCount")]
    player_count: u8,
    #[serde(rename = "maxPlayers")]
    max_players: u8,
    #[serde(rename = "gamePhase")]
    game_phase: String,
    pot: u32,
    blinds: BlindsConfig,
    config: Option<TableConfigResponse>,
}

#[derive(Debug, Serialize, Deserialize)]
struct TableConfigResponse {
    #[serde(rename = "maxPlayers")]
    max_players: u8,
    #[serde(rename = "smallBlind")]
    small_blind: u32,
    #[serde(rename = "bigBlind")]
    big_blind: u32,
}

#[derive(Debug, Serialize, Deserialize)]
struct BlindsConfig {
    small: u32,
    big: u32,
}

// Helper function to create a properly configured HTTP client
fn create_http_client() -> Result<Client, String> {
    let mut headers = header::HeaderMap::new();
    headers.insert(
        header::USER_AGENT,
        header::HeaderValue::from_static("Primo-Poker-Desktop/1.0")
    );
    headers.insert(
        header::ACCEPT,
        header::HeaderValue::from_static("application/json")
    );
    
    Client::builder()
        .default_headers(headers)
        .timeout(std::time::Duration::from_secs(30))
        .connect_timeout(std::time::Duration::from_secs(10))
        // Use native TLS for better compatibility
        .use_native_tls()
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))
}

// Check backend connection
#[tauri::command]
async fn check_backend_connection(api_url: String) -> Result<ConnectionStatus, String> {
    let start = std::time::Instant::now();
    
    let client = create_http_client()?;
    
    match client.get(&format!("{}/api/health", api_url)).send().await {
        Ok(response) => {
            let latency_ms = start.elapsed().as_millis() as u32;
            let is_success = response.status().is_success();
            
            // Log response details for debugging
            eprintln!("Health check response: status={}, latency={}ms", response.status(), latency_ms);
            
            Ok(ConnectionStatus {
                connected: is_success,
                backend_url: api_url,
                latency_ms: Some(latency_ms),
            })
        }
        Err(e) => {
            eprintln!("Backend connection error: {}", e);
            eprintln!("URL attempted: {}/api/health", api_url);
            Ok(ConnectionStatus {
                connected: false,
                backend_url: api_url,
                latency_ms: None,
            })
        }
    }
}

// Login user
#[tauri::command]
async fn login(api_url: String, email: String, password: String) -> Result<LoginResponse, String> {
    let client = create_http_client()?;
    let response = client
        .post(&format!("{}/api/auth/login", api_url))
        .header(header::CONTENT_TYPE, "application/json")
        .json(&LoginRequest { username: email.clone(), password })
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if response.status().is_success() {
        let login_response: LoginResponse = response.json().await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        
        // Store tokens securely
        let auth_token = AuthToken {
            access_token: login_response.tokens.access_token.clone(),
            refresh_token: login_response.tokens.refresh_token.clone(),
            expires_at: Utc::now() + Duration::hours(24), // Assuming 24h expiry
        };
        
        store_auth_token_secure(auth_token)?;
        
        // Convert to expected format for frontend
        Ok(LoginResponse {
            user: login_response.user,
            tokens: login_response.tokens,
            message: login_response.message,
        })
    } else {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        Err(format!("Login failed: {}", error_text))
    }
}

// Store auth token securely using system keyring
fn store_auth_token_secure(token: AuthToken) -> Result<(), String> {
    let entry = Entry::new("primo-poker", "auth-token")
        .map_err(|e| format!("Keyring error: {}", e))?;
    
    let token_json = serde_json::to_string(&token)
        .map_err(|e| format!("Serialization error: {}", e))?;
    
    entry.set_password(&token_json)
        .map_err(|e| format!("Failed to store token: {}", e))?;
    
    Ok(())
}

// Retrieve auth token
#[tauri::command]
async fn get_auth_token() -> Result<Option<AuthToken>, String> {
    let entry = Entry::new("primo-poker", "auth-token")
        .map_err(|e| format!("Keyring error: {}", e))?;
    
    match entry.get_password() {
        Ok(token_json) => {
            let token: AuthToken = serde_json::from_str(&token_json)
                .map_err(|e| format!("Failed to parse token: {}", e))?;
            
            // Check if token is expired
            if token.expires_at > Utc::now() {
                Ok(Some(token))
            } else {
                // Token expired, remove it
                let _ = entry.delete_password();
                Ok(None)
            }
        }
        Err(_) => Ok(None),
    }
}

// Logout user
#[tauri::command]
async fn logout() -> Result<(), String> {
    let entry = Entry::new("primo-poker", "auth-token")
        .map_err(|e| format!("Keyring error: {}", e))?;
    
    match entry.delete_password() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // Already logged out
        Err(e) => Err(format!("Failed to logout: {}", e)),
    }
}

// Get user from stored token
#[tauri::command]
async fn get_user() -> Result<Option<User>, String> {
    // For now, return a mock user if we have a token
    // In a real app, this would decode the JWT or fetch user info
    match get_token_from_keyring() {
        Ok(_) => Ok(Some(User {
            id: "user123".to_string(),
            email: "test@example.com".to_string(),
            name: "Test User".to_string(),
        })),
        Err(_) => Ok(None),
    }
}

fn get_token_from_keyring() -> Result<String, String> {
    let entry = Entry::new("primo-poker", "auth-token")
        .map_err(|e| format!("Keyring error: {}", e))?;
    
    let token_json = entry.get_password()
        .map_err(|e| format!("Failed to get token: {}", e))?;
    
    let token: AuthToken = serde_json::from_str(&token_json)
        .map_err(|e| format!("Failed to parse token: {}", e))?;
    
    Ok(token.access_token)
}

// Get tables from backend
#[tauri::command]
async fn get_tables(api_url: String) -> Result<Vec<Table>, String> {
    let client = create_http_client()?;
    
    // Get token from keyring if available
    let token = match get_token_from_keyring() {
        Ok(token) => Some(token),
        Err(_) => None,
    };
    
    let mut request = client.get(format!("{}/api/tables", api_url));
    
    if let Some(token) = token {
        request = request.header("Authorization", format!("Bearer {}", token));
    }
    
    let response = request.send().await.map_err(|e| e.to_string())?;
    
    if !response.status().is_success() {
        return Err("Failed to fetch tables".to_string());
    }
    
    let api_response: ApiResponse<Vec<Table>> = response.json().await.map_err(|e| e.to_string())?;
    
    if api_response.success {
        Ok(api_response.data.unwrap_or_default())
    } else {
        Err(api_response.error.map(|e| e.message).unwrap_or_else(|| "Unknown error".to_string()))
    }
}

// Create a new table
#[tauri::command]
async fn create_table(api_url: String, config: TableConfig) -> Result<Table, String> {
    let client = create_http_client()?;
    
    // Get token from keyring
    let token = get_token_from_keyring()
        .map_err(|_| "Not authenticated".to_string())?;
    
    let response = client.post(format!("{}/api/tables", api_url))
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&config)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Failed to create table: {}", error_text));
    }
    
    let api_response: ApiResponse<Table> = response.json().await.map_err(|e| e.to_string())?;
    
    if api_response.success {
        Ok(api_response.data.ok_or_else(|| "No table data returned".to_string())?)
    } else {
        Err(api_response.error.map(|e| e.message).unwrap_or_else(|| "Unknown error".to_string()))
    }
}

// Join a table
#[tauri::command]
async fn join_table(api_url: String, table_id: String, buy_in: u32) -> Result<serde_json::Value, String> {
    let client = create_http_client()?;
    
    // Get token from keyring
    let token = get_token_from_keyring()
        .map_err(|_| "Not authenticated".to_string())?;
    
    let response = client.post(format!("{}/api/tables/{}/join", api_url, table_id))
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "buyIn": buy_in }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Failed to join table: {}", error_text));
    }
    
    let api_response: ApiResponse<serde_json::Value> = response.json().await.map_err(|e| e.to_string())?;
    
    if api_response.success {
        Ok(api_response.data.unwrap_or(serde_json::json!({})))
    } else {
        Err(api_response.error.map(|e| e.message).unwrap_or_else(|| "Unknown error".to_string()))
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            check_backend_connection,
            login,
            logout,
            get_auth_token,
            get_user,
            get_tables,
            create_table,
            join_table
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}