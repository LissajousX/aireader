#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// On Linux, detect virtual machines or software GPU renderers and disable
/// WebKitGTK GPU compositing to prevent the white-screen issue.
/// Must run BEFORE Tauri/WebKitGTK initializes.
#[cfg(target_os = "linux")]
fn disable_gpu_compositing_if_needed() {
    // Skip if the user already set it explicitly
    if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_some() {
        return;
    }

    let dominated_by_vm = is_virtual_machine();
    let software_gpu = is_software_renderer();

    if dominated_by_vm || software_gpu {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        eprintln!(
            "[aireader] Disabled WebKitGTK GPU compositing (vm={}, sw_gpu={})",
            dominated_by_vm, software_gpu
        );
    }
}

#[cfg(target_os = "linux")]
fn is_virtual_machine() -> bool {
    // Method 1: systemd-detect-virt (most reliable)
    if let Ok(output) = std::process::Command::new("systemd-detect-virt").output() {
        if output.status.success() {
            let virt = String::from_utf8_lossy(&output.stdout);
            let virt = virt.trim();
            // "none" means bare metal
            if !virt.is_empty() && virt != "none" {
                return true;
            }
        }
    }

    // Method 2: DMI product name heuristic
    if let Ok(product) = std::fs::read_to_string("/sys/class/dmi/id/product_name") {
        let p = product.trim().to_lowercase();
        if p.contains("virtualbox")
            || p.contains("vmware")
            || p.contains("qemu")
            || p.contains("kvm")
            || p.contains("hyper-v")
            || p.contains("parallels")
        {
            return true;
        }
    }

    false
}

#[cfg(target_os = "linux")]
fn is_software_renderer() -> bool {
    // Check OpenGL renderer string via glxinfo (if available)
    if let Ok(output) = std::process::Command::new("glxinfo")
        .arg("-B")
        .output()
    {
        let info = String::from_utf8_lossy(&output.stdout).to_lowercase();
        if info.contains("llvmpipe")
            || info.contains("swrast")
            || info.contains("softpipe")
            || info.contains("lavapipe")
        {
            return true;
        }
    }
    false
}

fn main() {
    #[cfg(target_os = "linux")]
    disable_gpu_compositing_if_needed();

    aireader_lib::run()
}
