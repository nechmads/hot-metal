# Privacy Policy and Terms of Service Pages

**Date Added:** February 15, 2026  
**Commit:** 2fef305

## Overview

Added comprehensive Privacy Policy and Terms of Service pages to the Hot Metal web application to ensure legal compliance and set clear expectations for users.

## New Pages

### 1. Privacy Policy (`/privacy`)
**File:** `apps/web/src/pages/PrivacyPage.tsx`

A comprehensive privacy policy covering:
- **Information Collection**: Account info, connected accounts (LinkedIn, X), automatically collected data
- **Usage of Information**: Service provision, AI content processing, analytics
- **AI and Content Processing**: How AI models process user content, third-party providers, opt-out options
- **Information Sharing**: Third-party platforms, service providers, legal requirements
- **Data Security**: Encryption, security measures, infrastructure
- **Data Retention**: Retention periods, deletion requests
- **User Rights**: Access, correction, deletion, portability, opt-out
- **International Transfers**: Data transfer disclosures
- **Children's Privacy**: Age restrictions
- **Cookies**: Cookie types and usage
- **Regional Compliance**: CCPA (California), GDPR (European)
- **Contact Information**: privacy@farfarawaylabs.com

### 2. Terms of Service (`/terms`)
**File:** `apps/web/src/pages/TermsPage.tsx`

Comprehensive terms covering:
- **Agreement to Terms**: Binding agreement, modification rights
- **Eligibility**: Age requirements, legal capacity
- **Account Registration**: Security, responsibilities
- **Third-Party Accounts**: LinkedIn and X connection terms, responsibilities
- **User Content**: Ownership, licensing, restrictions, removal rights
- **AI-Generated Content**: Disclaimer, user responsibility for verification
- **Acceptable Use**: Prohibited activities
- **Intellectual Property**: Platform ownership, trademark protection
- **Subscription and Payment**: Billing, cancellation, free trials
- **Disclaimers**: "As is" provisions, no warranties
- **Limitation of Liability**: Damage limitations
- **Indemnification**: User obligations
- **Termination**: Platform rights, user rights
- **Dispute Resolution**: Governing law (California), arbitration
- **General Provisions**: Entire agreement, severability, assignment
- **Contact Information**: legal@farfarawaylabs.com

## Features

### Styling and Layout
- Consistent design with existing Hot Metal pages
- Uses project's CSS custom properties for theming
- Responsive layout (mobile-friendly)
- Proper hierarchy with clear sections
- Professional typography and spacing

### Navigation
- Integrated with `PublicNavbar` component
- Footers include links to Privacy and Terms on all public pages:
  - Landing page
  - About page
  - FAQ page
  - Privacy page (self-referential)
  - Terms page (self-referential)

### Content Highlights

#### Privacy-Specific Sections
1. **Connected Account Information**:
   - LinkedIn: Profile information, posting permissions
   - X (Twitter): Account handle, posting permissions
   - Users can disconnect at any time

2. **AI and Content Processing**:
   - Transparency about AI provider usage
   - No training on user content without opt-in
   - User retains content rights

3. **Regional Compliance**:
   - CCPA (California Privacy Rights)
   - GDPR (European Privacy Rights)
   - Specific rights and contact information

#### Terms-Specific Sections
1. **Third-Party Account Connections**:
   - Clear authorization requirements
   - User responsibility for posted content
   - Platform change disclaimers

2. **AI-Generated Content**:
   - "As is" disclaimers
   - User verification requirements
   - Accuracy disclaimers

3. **Subscription Terms**:
   - Billing cycle information
   - Cancellation policies
   - Free trial terms

## Routes Added

```typescript
<Route path="/privacy/*" element={<PrivacyPage />} />
<Route path="/terms/*" element={<TermsPage />} />
```

## Footer Updates

All public pages now include:
```
Hot Metal · About · FAQ · Privacy · Terms · Waitlist
```

## Company Information

- **Company Name**: Far Far Away Labs
- **Website**: https://farfarawaylabs.com
- **Privacy Contact**: privacy@farfarawaylabs.com
- **Legal Contact**: legal@farfarawaylabs.com

## Legal Jurisdiction

- **Governing Law**: California, United States
- **Dispute Resolution**: Arbitration (American Arbitration Association)
- **Venue**: San Francisco, California

## Compliance Notes

### GDPR (European Users)
- Right to access, correction, deletion, portability
- Lawful bases: Contract, consent, legitimate interests, legal obligations
- Data transfer safeguards in place

### CCPA (California Users)
- Right to know, delete, opt-out
- No sale of personal information
- Non-discrimination protection

### COPPA (Children)
- Service not intended for users under 13
- No knowing collection of children's data

## Testing

- ✅ Build successful (no TypeScript errors)
- ✅ Type check passed
- ✅ Routes accessible
- ✅ Links working in all footers
- ✅ Responsive design verified

## Future Considerations

1. **Content Updates**: Review and update policies as features evolve
2. **Additional Sections**: Consider adding cookie consent banner
3. **Translations**: Add multi-language support if expanding internationally
4. **Version History**: Consider maintaining changelog of policy updates
5. **User Notification**: Email notification system for policy changes

## Usage

Users can access these pages:
- Directly via URL: `https://hotmetal.app/privacy` or `https://hotmetal.app/terms`
- Via footer links on any public page
- Before account creation (easily accessible)

## Notes

- Both pages use the same styling and layout pattern as other public pages
- Content is comprehensive but written in clear, accessible language
- Specific attention paid to AI-related disclosures (unique to Hot Metal)
- LinkedIn and X integration specifically addressed in both documents
- Legal language balanced with user-friendliness
