/*
 * crt_fix.c - Provide __imp_ symbol wrappers for MSVC static/dynamic CRT mismatch.
 *
 * Problem: bundled sqlite3.c (via cc crate) is compiled with /MD (dynamic CRT),
 * generating __imp_memchr, __imp_strchr, __imp_strrchr references. But the final
 * Rust binary links with static CRT (libcmt.lib) which doesn't provide these.
 *
 * Solution: define function pointers with the __imp_ names pointing to the static
 * CRT implementations, so the linker can resolve them.
 */
#include <string.h>

typedef void* (*fn_memchr)(const void*, int, size_t);
typedef char* (*fn_strchr)(const char*, int);
typedef char* (*fn_strrchr)(const char*, int);

fn_memchr __imp_memchr = memchr;
fn_strchr __imp_strchr = strchr;
fn_strrchr __imp_strrchr = strrchr;
