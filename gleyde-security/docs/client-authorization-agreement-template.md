> **⚠️ TEMPLATE — NOT LEGAL ADVICE. HAVE A LICENSED ATTORNEY IN YOUR STATE REVIEW AND ADAPT THIS DOCUMENT BEFORE USING IT WITH ANY CLIENT.**
> Laws on computer access, data privacy and professional liability vary by state and industry (for example, lenders may be subject to the GLBA Safeguards Rule). This template is a starting point only.

---

# Security Testing Authorization & Scope Agreement

**Agreement No.:** ____________  **Date:** ____________

This Security Testing Authorization & Scope Agreement (the "Agreement") is between:

**Service Provider:** Gleyde Technologies, LLC, a __________ limited liability company ("Gleyde"), located at ______________________________.

**Client:** ______________________________ ("Client"), located at ______________________________.

## 1. Purpose

Client engages Gleyde to perform the security services described below and **expressly authorizes** Gleyde to access and test the systems listed in Section 3, solely for the purpose of identifying security vulnerabilities and reporting them to Client.

## 2. Authority of signer

The person signing for Client represents and warrants that they:

(a) are authorized to bind Client to this Agreement;
(b) own, or have the written authority of the owner of, each system listed in Section 3, including any authority required from hosting providers, website platforms, or third-party vendors; and
(c) will provide copies of any third-party permissions on request.

Client will indemnify Gleyde for claims arising from a breach of this Section. ⚖️ *Attorney: review the scope of indemnity.*

## 3. Scope

### 3.1 In-scope systems

| # | System (URL / IP / app name) | Environment (production / staging) | Owner / hosting provider | Notes |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

### 3.2 Explicitly out of scope

Gleyde will **not** test the following:

- Any system not listed in 3.1
- Third-party services not owned by Client (e.g. payment processors, MLS systems, email providers), unless written permission from that provider is attached
- __________________________________________

### 3.3 Services and methods

Check all that apply:

- [ ] Website Security Audit: automated scanning and manual testing for common web vulnerabilities (e.g. OWASP Top 10)
- [ ] Configuration review: TLS/SSL, security headers, DNS, and email authentication (SPF/DKIM/DMARC)
- [ ] Authenticated testing using test accounts provided by Client
- [ ] Security Hardening: Gleyde will make the changes listed in Schedule A
- [ ] Ongoing Monitoring: per Schedule B
- [ ] Other: __________________________________________

### 3.4 Prohibited activities

Unless separately authorized in writing, Gleyde will **not** perform:

- denial-of-service or load testing;
- social engineering or phishing of Client staff;
- physical security testing;
- destruction or modification of production data; or
- access to customer personal or financial data beyond what is minimally necessary to demonstrate a finding.

## 4. Testing window and contacts

**Testing window:** from ____/____/______ to ____/____/______, between ____:____ and ____:____ (time zone: ______).

**Source IP addresses Gleyde will test from:** ______________________

| Role | Name | Phone | Email |
|---|---|---|---|
| Client primary contact | | | |
| Client emergency contact (24/7) | | | |
| Gleyde engagement lead | | | |

**Stop procedure.** Client may halt testing at any time by contacting the Gleyde engagement lead. Gleyde will stop within ______ minutes of that notice.

**Critical findings.** If Gleyde discovers a critical vulnerability, or evidence of an active compromise, it will notify Client's primary contact within ______ hours, without waiting for the final report.

## 5. Client responsibilities

Client will:

(a) back up all in-scope systems before testing begins;
(b) notify its hosting provider and any managed IT provider, if required by their terms;
(c) provide test accounts and credentials through a secure channel (never plain email); and
(d) tell Gleyde about any fragile systems or known issues.

## 6. Confidentiality and data handling

Gleyde will:

- treat all findings, credentials, and Client data as confidential;
- share findings only with the contacts named above;
- store engagement data encrypted; and
- securely delete Client data and credentials within ______ days after the engagement ends, except for the final report, which is retained for ______ ⚖️.

Gleyde will not disclose vulnerabilities to third parties without Client's written consent, except where required by law.

## 7. Deliverables

- A written report containing an executive summary, findings ranked by risk, evidence, and remediation guidance
- A walkthrough call
- A re-test of fixed items, if included in the fee

Delivery date: within ______ business days after the testing window closes.

## 8. Fees

**Fixed fee:** $__________

**Payment terms:** ______% due on signing, balance due on delivery, net ______ days.

Work outside this scope requires a written change order.

## 9. Acknowledgment of risk; limitation of liability ⚖️

Client acknowledges that:

- security testing carries an inherent risk of service disruption, despite reasonable care; and
- no assessment can find every vulnerability or guarantee that systems are secure.

Gleyde will perform the services with reasonable professional care.

TO THE MAXIMUM EXTENT PERMITTED BY LAW, GLEYDE'S TOTAL LIABILITY UNDER THIS AGREEMENT SHALL NOT EXCEED THE FEES PAID FOR THE SERVICES GIVING RISE TO THE CLAIM. NEITHER PARTY SHALL BE LIABLE FOR INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES.

*Attorney: confirm enforceability in your state and consistency with your insurance policies.*

## 10. General ⚖️

**Governing law:** ______________.

**Term.** This Agreement covers only the testing window above. Any new testing requires a new or amended authorization.

**Entire agreement.** This Agreement and its schedules are the entire agreement between the parties on this subject. Amendments must be in writing and signed by both parties.

**Signatures.** Electronic signatures are valid.

---

## Signatures

**CLIENT**

Signature: ______________________________

Name: ______________________________

Title: ______________________________

Date: ______________

**GLEYDE TECHNOLOGIES, LLC**

Signature: ______________________________

Name: ______________________________

Title: ______________________________

Date: ______________

---

**Schedule A: Hardening work items** *(if applicable)*

**Schedule B: Monitoring terms** *(if applicable)*

**Attachment: Third-party permissions** *(if applicable)*
