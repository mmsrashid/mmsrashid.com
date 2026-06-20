/**
 * One-time script to obtain Google Calendar refresh tokens for both accounts.
 * Run with: node scripts/get-google-tokens.mjs
 *
 * It will open a browser URL for each account in sequence.
 * Paste the auth code from the redirect URL when prompted.
 * At the end it prints the env vars to add to Vercel.
 */

import http from 'http'
import https from 'https'
import { createInterface } from 'readline'
import { exec } from 'child_process'

// Set these in your shell before running:
//   $env:GOOGLE_CLIENT_ID="..."
//   $env:GOOGLE_CLIENT_SECRET="..."
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars before running.')
  process.exit(1)
}
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly'

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()) }))
}

function openUrl(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"` :
               process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`
  exec(cmd)
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  }).toString()

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => resolve(JSON.parse(data)))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function getTokenForAccount(label, hint) {
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&access_type=offline` +
    `&prompt=consent` +
    (hint ? `&login_hint=${encodeURIComponent(hint)}` : '')

  console.log(`\n=== ${label} ===`)
  console.log('Opening browser for Google sign-in...')
  console.log('(If it does not open, paste this URL manually:)')
  console.log(authUrl)
  openUrl(authUrl)

  console.log('\nAfter signing in, Google will show you a code on the page.')
  const code = await ask('Paste the code here: ')

  const tokens = await exchangeCode(code)
  if (tokens.error) {
    console.error('Error:', tokens.error, tokens.error_description)
    process.exit(1)
  }

  return tokens.refresh_token
}

async function main() {
  console.log('Google Calendar Token Fetcher')
  console.log('================================')
  console.log('This will open your browser twice — once for each Google account.')
  console.log('Sign in with the correct account each time.\n')

  const personalToken = await getTokenForAccount('Personal account', 'mohammed.rashid13@gmail.com')
  const workToken = await getTokenForAccount('Work account', 'mohammedrashid@drtimpearce.com')

  console.log('\n\n=== DONE — Add these to Vercel Environment Variables ===\n')
  console.log(`GOOGLE_CLIENT_ID=${CLIENT_ID}`)
  console.log(`GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`)
  console.log(`GOOGLE_REFRESH_TOKEN_PERSONAL=${personalToken}`)
  console.log(`GOOGLE_REFRESH_TOKEN_WORK=${workToken}`)
  console.log('\nGo to: https://vercel.com/vncr/mmsrashid-com/settings/environment-variables')
  console.log('Add all four variables (Environment: Production + Preview + Development)\n')
}

main().catch(console.error)
