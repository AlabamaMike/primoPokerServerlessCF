// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize)]
struct ConnectionStatus {
    connected: bool,
    backend_url: String,
    latency_ms: Option<u32>,
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

// Store auth token securely
#[tauri::command]
async fn store_auth_token(token: String) -> Result<(), String> {
    // TODO: Implement secure token storage
    println!("Storing auth token");
    Ok(())
}

// Retrieve auth token
#[tauri::command]
async fn get_auth_token() -> Result<Option<String>, String> {
    // TODO: Implement secure token retrieval
    Ok(None)
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
            store_auth_token,
            get_auth_token
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}