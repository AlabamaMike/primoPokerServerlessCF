// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use tauri::Manager;
use keyring::Entry;
use chrono::{DateTime, Utc, Duration};

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
    email: String,
    password: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct LoginResponse {
    user: User,
    access_token: String,
    refresh_token: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct User {
    id: String,
    email: String,
    name: String,
}

// Check backend connection
#[tauri::command]
async fn check_backend_connection(api_url: String) -> Result<ConnectionStatus, String> {
    let start = std::time::Instant::now();
    
    match reqwest::get(&format!("{}/api/health", api_url)).await {
        Ok(response) => {
            let latency_ms = start.elapsed().as_millis() as u32;
            Ok(ConnectionStatus {
                connected: response.status().is_success(),
                backend_url: api_url,
                latency_ms: Some(latency_ms),
            })
        }
        Err(e) => {
            eprintln!("Backend connection error: {}", e);
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
    let client = reqwest::Client::new();
    let response = client
        .post(&format!("{}/api/auth/login", api_url))
        .json(&LoginRequest { email: email.clone(), password })
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if response.status().is_success() {
        let login_response: LoginResponse = response.json().await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        
        // Store tokens securely
        let auth_token = AuthToken {
            access_token: login_response.access_token.clone(),
            refresh_token: login_response.refresh_token.clone(),
            expires_at: Utc::now() + Duration::hours(24), // Assuming 24h expiry
        };
        
        store_auth_token_secure(auth_token)?;
        
        Ok(login_response)
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
            get_auth_token
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}