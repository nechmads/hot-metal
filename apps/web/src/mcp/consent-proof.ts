import { SignJWT, jwtVerify } from 'jose'

const audience = 'hotmetal-mcp-consent'
function key(secret: string | undefined) {
  if (!secret || secret.length < 32) throw new Error('MCP consent signing is not configured')
  return new TextEncoder().encode(secret)
}
export function signConsentProof(subject: string, transactionId: string, secret: string | undefined) {
  return new SignJWT({ transactionId }).setProtectedHeader({ alg: 'HS256' })
    .setSubject(subject).setAudience(audience).setIssuer(audience)
    .setIssuedAt().setExpirationTime('10m').sign(key(secret))
}
export async function verifyConsentProof(proof: string, subject: string, transactionId: string, secret: string | undefined) {
  const { payload } = await jwtVerify(proof, key(secret), {
    algorithms: ['HS256'], issuer: audience, audience, subject,
  })
  if (payload.transactionId !== transactionId) throw new Error('Consent transaction does not match')
}
