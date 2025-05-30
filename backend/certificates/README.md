# Certificate Setup Guide

This directory needs to contain the following certificate files (excluded from the repository for security reasons):

1. `AuthKey_XXXXXXXX.p8`: Your Apple Push Notification Authentication Key
2. `wwdr.pem`: Apple Worldwide Developer Relations Certificate
3. `signerCert.pem`: Your Pass Type ID certificate (public part)
4. `signerKey.pem`: Your Pass Type ID private key

## Required Certificate Setup Steps

### Push Notification Key (.p8)

1. Log in to your [Apple Developer Account](https://developer.apple.com/account/)
2. Go to Certificates, Identifiers & Profiles > Keys
3. Create a new key with Apple Push Notifications service (APNs) enabled
4. Download the key (it will be named like AuthKey_XXXXXXXX.p8)
5. Place it in this directory

### WWDR Certificate (.pem)

1. Download Apple's WWDR certificate from [Apple's PKI repository](https://www.apple.com/certificateauthority/)
2. Convert it to .pem format if needed using OpenSSL:
   ```
   openssl x509 -in AppleWWDRCA.cer -inform DER -out wwdr.pem -outform PEM
   ```
3. Place the wwdr.pem file in this directory

### Signer Certificate and Key (.pem)

1. Log in to your [Apple Developer Account](https://developer.apple.com/account/)
2. Go to Certificates, Identifiers & Profiles > Identifiers
3. Register a Pass Type ID identifier
4. Create a certificate for this Pass Type ID
5. Download the certificate and add it to Keychain Access
6. Export the certificate and private key as .p12 file
7. Convert the .p12 to .pem files using OpenSSL:
   ```
   openssl pkcs12 -in PassTypeID.p12 -clcerts -nokeys -out signerCert.pem 
   openssl pkcs12 -in PassTypeID.p12 -nocerts -out signerKey.pem
   ```
8. Place both .pem files in this directory

## Configuration

After adding all required certificates, you need to update your environment variables:

1. Create/edit your .env file in the loyalty-server directory
2. Add your certificate passwords:
   ```
   APN_PASSPHRASE=your_p8_key_password
   PASS_CERT_PASSPHRASE=your_cert_passphrase
   ```

**IMPORTANT:** Never commit these certificate files to a public repository. They contain sensitive private keys that should be kept secure. 