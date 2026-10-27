//! Exercise the actual optimized GLib code used by the Linux app.
#![cfg(target_os = "linux")]
use glib::variant::ToVariant;

#[test]
fn string_variant_iterator_survives_optimized_forward_and_reverse_access() {
    let values = ["first", "", "žluťoučký", "last"];
    let variant = values.to_variant();
    assert_eq!(
        variant.array_iter_str().unwrap().collect::<Vec<_>>(),
        values
    );
    assert_eq!(
        variant.array_iter_str().unwrap().rev().collect::<Vec<_>>(),
        values.into_iter().rev().collect::<Vec<_>>()
    );
    let mut mixed = variant.array_iter_str().unwrap();
    assert_eq!(mixed.next(), Some("first"));
    assert_eq!(mixed.next_back(), Some("last"));
    assert_eq!(mixed.next_back(), Some("žluťoučký"));
    assert_eq!(mixed.next(), Some(""));
    assert_eq!(mixed.next(), None);
    assert_eq!(mixed.next_back(), None);
    let empty: Vec<String> = Vec::new();
    assert_eq!(empty.to_variant().array_iter_str().unwrap().count(), 0);
}
