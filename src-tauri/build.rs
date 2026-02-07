fn main() {
    // Fix MSVC release linking: bundled sqlite3 (via cc crate, compiled with /MD)
    // references __imp_memchr, __imp_strchr, __imp_strrchr. Rust links with static
    // CRT (libcmt.lib) which doesn't provide these __imp_ symbols.
    // This shim defines function pointers with the __imp_ names that redirect
    // to the static CRT implementations.
    #[cfg(target_env = "msvc")]
    cc::Build::new()
        .file("crt_fix.c")
        .compile("crt_fix");

    tauri_build::build()
}
