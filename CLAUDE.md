## IMPORTANT - Server Constraints

This server runs an X1 validator using tachyon-validator binaries.
The X1/Tachyon release must always be active at ~/.local/share/solana/install/active_release

Never run:
- solana-install
- agave-install
- Any command that modifies ~/.local/share/solana/install/
- Any Solana/Agave binary updates

Violating this will overwrite the X1/Tachyon binaries with Agave/Solana 
mainnet binaries and break the validator.
