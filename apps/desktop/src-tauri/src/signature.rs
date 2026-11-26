//! Checks that a downloaded installer was signed by NEXUS's own release pipeline (desktop.yml)
//! before it is run. Without this, whoever could change a release on GitHub could put any program
//! on every PC with NEXUS.
//!
//! The pipeline signs each installer with an ed25519 key (GitHub secret NEXUS_UPDATE_SIGNING_KEY)
//! and publishes `<file>.sig` next to it. The public half is built into the app from the
//! repository variable NEXUS_UPDATE_PUBLIC_KEY. An app built without a public key accepts
//! unsigned updates as before, so updates keep working until the keys are set up; an app built
//! with one refuses any update whose signature does not match.

use ed25519_dalek::{Signature, Verifier, VerifyingKey};

/// The public key this build trusts, as 64 hex characters; None when none was set at build time.
pub fn public_key() -> Option<&'static str> {
    option_env!("NEXUS_UPDATE_PUBLIC_KEY")
        .map(str::trim)
        .filter(|k| !k.is_empty())
}

fn hex(text: &str) -> Option<Vec<u8>> {
    let text = text.trim();
    if text.len() % 2 != 0 {
        return None;
    }
    (0..text.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(text.get(i..i + 2)?, 16).ok())
        .collect()
}

/// Ok when [signature_hex] is a valid signature of [data] by [public_key_hex].
pub fn verify(public_key_hex: &str, data: &[u8], signature_hex: &str) -> Result<(), String> {
    let key: [u8; 32] = hex(public_key_hex)
        .and_then(|k| k.try_into().ok())
        .ok_or("De ingebouwde sleutel voor updates is ongeldig.")?;
    let key = VerifyingKey::from_bytes(&key)
        .map_err(|_| "De ingebouwde sleutel voor updates is ongeldig.")?;
    let sig: [u8; 64] = hex(signature_hex)
        .and_then(|s| s.try_into().ok())
        .ok_or("De handtekening van de update is onleesbaar.")?;
    key.verify(data, &Signature::from_bytes(&sig)).map_err(|_| {
        "De handtekening van de update klopt niet. NEXUS installeert ze niet.".to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // A fixed test key pair (seed 01..20), never used for real releases.
    const PUBLIC: &str = "79b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad049664";

    fn sign(data: &[u8]) -> String {
        use ed25519_dalek::{Signer, SigningKey};
        let seed: [u8; 32] = core::array::from_fn(|i| i as u8 + 1);
        SigningKey::from_bytes(&seed)
            .sign(data)
            .to_bytes()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect()
    }

    #[test]
    fn accepts_the_installer_it_signed() {
        let installer = b"nexus-os-setup.exe bytes";
        assert_eq!(verify(PUBLIC, installer, &sign(installer)), Ok(()));
    }

    #[test]
    fn refuses_a_changed_installer() {
        let signature = sign(b"original");
        assert!(verify(PUBLIC, b"original but changed", &signature)
            .unwrap_err()
            .contains("klopt niet"));
    }

    #[test]
    fn refuses_garbage() {
        assert!(verify(PUBLIC, b"x", "not hex").is_err());
        assert!(verify(PUBLIC, b"x", "abcd").is_err());
        assert!(verify("1234", b"x", &sign(b"x")).is_err());
    }
}
