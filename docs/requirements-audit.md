# Requirements Audit

This file is a first-pass audit of the `.docx` / `requirements_extracted.txt` requirements against the current implementation after Sprint 3.

Status legend:

| Status | Meaning |
|---|---|
| `done` | Implemented and believed to match the requirement closely |
| `partial` | Implemented in large part, but with a known gap, mismatch, or hardening need |
| `missing` | Not implemented yet |
| `stretch` | Advanced / optional requirement beyond the base spec |

## 1. Introduction / Product Scope

| Section | Requirement | Status | Evidence / Current state | Notes / Follow-up |
|---|---|---|---|---|
| 1 | Classic web-based chat app | `partial` | App is clearly a classic chat product with rooms, contacts, history, unread, presence | UI still needs final wireframe/polish pass in Sprint 4 |
| 1 | User registration and authentication | `done` | Registration, login, logout, persistent sessions, password reset/change are implemented |  |
| 1 | Public and private chat rooms | `done` | Public catalog, private invitations, room membership, room admin flows are implemented |  |
| 1 | One-to-one personal messaging | `done` | DMs implemented with history, unread, realtime, freeze-on-block rules |  |
| 1 | Contacts / friends | `done` | Friend list, requests, accept/reject/remove, blocks are implemented |  |
| 1 | File and image sharing | `done` | Rooms and DMs support attachments, downloads, authorization |  |
| 1 | Basic moderation and administration | `done` | Room management modal, admins, ban/unban semantics, delete room, message delete exist | Clarified: remove-member => ban is acceptable |
| 1 | Persistent message history | `done` | Persisted messages, infinite scroll, replies, edits, deletes, unread, realtime recovery path exist |  |
| 1 | Straightforward navigation, room/contact lists, history, notifications, presence | `partial` | Broadly true | Final Sprint 4 polish should align navigation and wireframe details more tightly |
| 1 | Intended moderate scale / ~300 simultaneous users | `partial` | Architecture targets this | Not yet proven with explicit validation/load evidence |

## 2.1 User Accounts and Authentication

| Section | Requirement | Status | Evidence / Current state | Notes / Follow-up |
|---|---|---|---|---|
| 2.1.1 | Self-registration using email, password, unique username | `done` | Implemented |  |
| 2.1.2 | Email must be unique | `done` | Enforced in backend and tested |  |
| 2.1.2 | Username must be unique | `done` | Enforced in backend and tested |  |
| 2.1.2 | Username is immutable after registration | `done` | No username-change flow exists |  |
| 2.1.2 | Email verification is not required | `done` | No email verification step exists |  |
| 2.1.3 | Sign in with email and password | `done` | Implemented |  |
| 2.1.3 | Sign out logs out current browser session only | `done` | Implemented with per-session revoke semantics |  |
| 2.1.3 | Persistent login across browser close/reopen | `done` | Implemented via persistent session cookie |  |
| 2.1.4 | Password reset | `done` | Implemented with real SMTP/Mailpit dev path |  |
| 2.1.4 | Password change for logged-in users | `done` | Implemented |  |
| 2.1.4 | No forced periodic password change | `done` | No such requirement enforced |  |
| 2.1.4 | Passwords stored securely in hashed form | `done` | Implemented |  |
| 2.1.5 | Delete account action | `done` | Implemented in profile page and backend |  |
| 2.1.5 | Account is removed | `done` | Implemented as soft-deleted/anonymized inactive account for data consistency | This interpretation preserves required historical content while removing active use |
| 2.1.5 | Only rooms owned by that user are deleted | `done` | Implemented |  |
| 2.1.5 | Messages/files/images in deleted owned rooms are deleted permanently | `done` | Implemented including attachment file deletion from storage |  |
| 2.1.5 | Membership in other rooms is removed | `done` | Implemented |  |

## 2.2 User Presence and Sessions

| Section | Requirement | Status | Evidence / Current state | Notes / Follow-up |
|---|---|---|---|---|
| 2.2.1 | Presence statuses: online / AFK / offline | `done` | Implemented |  |
| 2.2.2 | AFK after 1 minute of inactivity across tabs | `done` | Implemented using heartbeat + inactivity tracking |  |
| 2.2.2 | If active in at least one tab, user is online | `done` | Implemented |  |
| 2.2.3 | Multi-tab presence correctness | `done` | Implemented | Sprint 4 reliability hardening should still stress test edge cases |
| 2.2.3 | Offline only when all browser tabs are gone/offloaded | `done` | Implemented with TTL/sweep-based degradation |  |
| 2.2.4 | View active sessions with browser/IP details | `done` | Implemented |  |
| 2.2.4 | Revoke selected sessions | `done` | Implemented |  |
| 2.2.4 | Current-browser logout only invalidates that browser | `done` | Implemented |  |

## 2.3 Contacts / Friends

| Section | Requirement | Status | Evidence / Current state | Notes / Follow-up |
|---|---|---|---|---|
| 2.3.1 | Personal contact/friend list | `done` | Implemented |  |
| 2.3.2 | Send friend request by username | `done` | Implemented |  |
| 2.3.2 | Send friend request from room user list | `done` | Implemented |  |
| 2.3.2 | Optional friend-request text | `done` | Implemented |  |
| 2.3.3 | Friendship requires recipient confirmation | `done` | Implemented |  |
| 2.3.4 | Remove friend | `done` | Implemented |  |
| 2.3.5 | User-to-user ban | `done` | Implemented |  |
| 2.3.5 | Banned user cannot contact blocker | `done` | Implemented through DM gating and frozen existing DM |  |
| 2.3.5 | New personal messaging blocked after ban | `done` | Implemented |  |
| 2.3.5 | Existing personal history remains visible but frozen | `done` | Implemented |  |
| 2.3.5 | Friendship effectively terminated on ban | `done` | Implemented |  |
| 2.3.6 | Personal messaging allowed only if users are friends and neither blocked the other | `done` | Implemented |  |

## 2.4 Chat Rooms

| Section | Requirement | Status | Evidence / Current state | Notes / Follow-up |
|---|---|---|---|---|
| 2.4.1 | Any registered user may create a room | `done` | Implemented |  |
| 2.4.2 | Room has name | `done` | Implemented |  |
| 2.4.2 | Room has description | `done` | Implemented |  |
| 2.4.2 | Room has public/private visibility | `done` | Implemented |  |
| 2.4.2 | Room has owner/admins/members/banned users | `done` | Implemented |  |
| 2.4.2 | Room names are unique | `done` | Implemented |  |
| 2.4.3 | Public catalog shows room name, description, member count | `done` | Implemented |  |
| 2.4.3 | Public catalog supports search | `done` | Implemented |  |
| 2.4.3 | Public rooms freely joinable unless banned | `done` | Implemented |  |
| 2.4.4 | Private rooms hidden from public catalog | `done` | Implemented |  |
| 2.4.4 | Private rooms joinable only by invitation | `done` | Implemented |  |
| 2.4.5 | Users may freely join public rooms unless banned from that room | `done` | Implemented | Also represented by the public-catalog/join behavior above, but kept here to mirror the source requirement structure |
| 2.4.5 | Users can leave rooms freely | `done` | Implemented |  |
| 2.4.5 | Owner cannot leave own room | `done` | Implemented |  |
| 2.4.5 | Owner may only delete room | `done` | Implemented |  |
| 2.4.6 | Deleting room permanently deletes all room messages | `done` | Implemented |  |
| 2.4.6 | Deleting room permanently deletes all room files/images | `done` | Implemented |  |
| 2.4.7 | Owner always admin and cannot lose admin privileges | `done` | Implemented |  |
| 2.4.7 | Admins may delete room messages | `done` | Implemented |  |
| 2.4.7 | Admins may remove members from room | `done` | Implemented |  |
| 2.4.7 | Admins may ban members from room | `done` | Ban semantics are implemented | Clarified: remove-member => ban is acceptable |
| 2.4.7 | Admins may view banned users list | `done` | Implemented |  |
| 2.4.7 | Admins may view who banned each banned user | `done` | Implemented |  |
| 2.4.7 | Admins may remove users from room ban list | `done` | Implemented |  |
| 2.4.7 | Admins may remove admin status from other admins except owner | `done` | Implemented |  |
| 2.4.7 | Owner may do all admin actions | `done` | Implemented |  |
| 2.4.7 | Owner may remove any admin | `done` | Implemented |  |
| 2.4.7 | Owner may remove any member | `done` | Implemented |  |
| 2.4.7 | Owner may delete room | `done` | Implemented |  |
| 2.4.8 | Remove-member by admin is treated as ban | `done` | Implemented |  |
| 2.4.8 | Banned user cannot rejoin unless unbanned | `done` | Implemented |  |
| 2.4.8 | Losing room access removes room-message access in UI | `done` | Implemented |  |
| 2.4.8 | Losing room access removes room file/image access | `done` | Implemented |  |
| 2.4.8 | Existing files remain stored unless room deleted | `done` | Implemented |  |
| 2.4.9 | Users may invite others to private rooms | `done` | Implemented |  |

## 2.5 Messaging

| Section | Requirement | Status | Evidence / Current state | Notes / Follow-up |
|---|---|---|---|---|
| 2.5.1 | Personal messages behave the same as room messages from UI/feature perspective | `partial` | Broadly true for history, replies, edits, deletes, attachments, realtime | Final parity audit still useful in Sprint 4 |
| 2.5.1 | Personal dialogs have exactly two participants | `done` | Implemented |  |
| 2.5.1 | Personal chats support same message/attachment features as room chats | `done` | Implemented, including emoji support in the composer |  |
| 2.5.1 | Only room chats have owner/admin moderation | `done` | Implemented |  |
| 2.5.2 | Plain text messages | `done` | Implemented |  |
| 2.5.2 | Multiline text messages | `done` | Implemented |  |
| 2.5.2 | Emoji in messages | `done` | Implemented with explicit composer emoji controls |  |
| 2.5.2 | Attachments in messages | `done` | Implemented |  |
| 2.5.2 | Reply/reference to another message | `done` | Implemented |  |
| 2.5.2 | Max text size 3 KB | `done` | Backend schema and frontend max length set to 3072 |  |
| 2.5.2 | UTF-8 text support | `done` | Implemented by normal string handling and browser/backend stack |  |
| 2.5.3 | Reply target visually outlined or quoted | `done` | Implemented |  |
| 2.5.4 | Users can edit own messages | `done` | Implemented |  |
| 2.5.4 | Gray “edited” indicator | `done` | Implemented |  |
| 2.5.5 | Message author can delete message | `done` | Implemented |  |
| 2.5.5 | Room admins can delete room messages | `done` | Implemented |  |
| 2.5.5 | Deleted messages need not be recoverable | `done` | Implemented as logical deleted-state UI without recovery feature |  |
| 2.5.6 | Messages stored persistently in chronological order | `done` | Implemented |  |
| 2.5.6 | Infinite scroll for very old history | `done` | Implemented |  |
| 2.5.6 | Offline messages persisted and delivered when recipient opens app | `done` | Implemented via persisted history + unread/read model |  |

## 2.6 Attachments

| Section | Requirement | Status | Evidence / Current state | Notes / Follow-up |
|---|---|---|---|---|
| 2.6.1 | Send images | `done` | Implemented |  |
| 2.6.1 | Send arbitrary file types | `done` | Implemented |  |
| 2.6.2 | Upload via explicit button | `done` | Implemented |  |
| 2.6.2 | Upload via copy/paste | `done` | Implemented |  |
| 2.6.3 | Preserve original filename | `done` | Implemented |  |
| 2.6.3 | Optional attachment comment | `done` | Implemented |  |
| 2.6.4 | Downloads limited to current room members / authorized DM participants | `done` | Implemented |  |
| 2.6.4 | Losing room access removes file/image access | `done` | Implemented |  |
| 2.6.5 | File remains stored after uploader loses access | `done` | Implemented |  |
| 2.6.5 | Uploader later cannot see/download/manage file after access loss | `done` | Implemented |  |

## 2.7 Notifications

| Section | Requirement | Status | Evidence / Current state | Notes / Follow-up |
|---|---|---|---|---|
| 2.7.1 | Unread indicator near room/contact with unread messages | `done` | Implemented |  |
| 2.7.1 | Unread cleared when corresponding chat opens | `done` | Implemented |  |
| 2.7.2 | Presence updates should appear with low latency | `done` | Implemented via websocket/inbox presence updates | Sprint 4 reliability should still stress race cases |

## 3. Non-Functional Requirements

| Section | Requirement | Status | Evidence / Current state | Notes / Follow-up |
|---|---|---|---|---|
| 3.1 | Support up to 300 simultaneous users | `partial` | Architecture is intended for this | Explicit validation evidence is missing |
| 3.1 | Single room may contain up to 1000 participants | `partial` | Data model does not block this | No explicit validation evidence yet |
| 3.1 | User may belong to unlimited number of rooms | `done` | No enforced small limit exists |  |
| 3.2 | Message delivery within 3 seconds | `partial` | Likely satisfied in local use | No formal latency validation yet |
| 3.2 | Presence propagation below 2 seconds | `partial` | Likely satisfied in local use | No formal latency validation yet |
| 3.2 | Usable with very large history including at least 10,000 messages | `partial` | Infinite scroll implemented | Large-history validation/demo data still needed |
| 3.3 | Messages stored persistently for years | `partial` | Persistent DB storage exists | “Years” not meaningfully provable in current project, but architecture aligns |
| 3.3 | Infinite scroll for older history | `done` | Implemented |  |
| 3.4 | Files stored on local filesystem | `done` | Implemented |  |
| 3.4 | Max file size 20 MB | `done` | Implemented |  |
| 3.4 | Max image size 3 MB | `done` | Implemented |  |
| 3.5 | No automatic logout due to inactivity required | `done` | Implemented |  |
| 3.5 | Login persists across browser close/open | `done` | Implemented |  |
| 3.5 | Multi-tab correctness | `done` | Implemented | Sprint 4 should harden edge cases |
| 3.6 | Preserve consistency of membership, bans, file access, history, admin/owner permissions | `partial` | Broadly implemented | Sprint 4 reliability pass is the right place to stress remaining edge cases |

## 4. UI Requirements

| Section | Requirement | Status | Evidence / Current state | Notes / Follow-up |
|---|---|---|---|---|
| 4.1 | Typical web chat layout with top menu, center message area, bottom input, side room/contact lists | `done` | Implemented |  |
| 4.1.1 | Rooms and contacts displayed on the right | `done` | Clarified with product guidance that either side is acceptable | Current layout aligns with the appendix wireframe even though the prose sentence says right |
| 4.1.1 | After entering a room, room list becomes compacted in accordion style | `partial` | There is a compact room list and management context, but not a strong accordion-style wireframe match | UI polish task |
| 4.1.1 | Room members shown on right with online statuses | `done` | Implemented |  |
| 4.2 | Auto-scroll to new messages only if already at bottom | `done` | Implemented |  |
| 4.2 | No forced autoscroll if user scrolled up | `done` | Implemented |  |
| 4.2 | Infinite scroll for older history | `done` | Implemented |  |
| 4.3 | Multiline text entry | `done` | Implemented |  |
| 4.3 | Emoji in messages | `done` | Implemented with explicit composer emoji controls |  |
| 4.3 | File/image attachment in composer | `done` | Implemented |  |
| 4.3 | Reply to message in composer | `done` | Implemented |  |
| 4.4 | Unread visually indicated near room names | `done` | Implemented |  |
| 4.4 | Unread visually indicated near contact names | `done` | Implemented |  |
| 4.5 | Admin actions available from menus and modal dialogs | `done` | Implemented via manage-room modal |  |
| 4.5 | Ban/unban user | `done` | Ban/unban behavior is available in room administration | Clarified: remove-member => ban is acceptable |
| 4.5 | Remove member | `done` | Implemented |  |
| 4.5 | Manage admins | `done` | Implemented |  |
| 4.5 | View banned users | `done` | Implemented |  |
| 4.5 | Delete messages | `done` | Implemented |  |
| 4.5 | Delete room | `done` | Implemented |  |

## 5. Notes and Clarifications

| Section | Requirement | Status | Evidence / Current state | Notes / Follow-up |
|---|---|---|---|---|
| 5 | Username/email uniqueness and immutability | `done` | Implemented |  |
| 5 | Public rooms discoverable and joinable unless banned | `done` | Implemented |  |
| 5 | Private rooms invitation-only | `done` | Implemented |  |
| 5 | Personal dialogs are chats with exactly two participants | `done` | Implemented |  |
| 5 | Existing personal history remains visible but frozen after user-to-user ban | `done` | Implemented |  |
| 5 | Room deletion permanently deletes room messages and attachments | `done` | Implemented |  |
| 5 | Losing room access loses access to room messages/files/images | `done` | Implemented |  |
| 5 | Files persist after upload unless room deleted, even if uploader later loses access | `done` | Implemented |  |
| 5 | App should resemble classic web chat rather than social network/collaboration suite | `partial` | Broadly true | Final Sprint 4 polish should reinforce this |
| 5 | Presence determined by most active tab | `done` | Implemented |  |
| 5 | Sign out only logs out current browser session | `done` | Implemented |  |
| 5 | Offline-recipient messages persist and display on next connection | `done` | Implemented |  |

## 6. Advanced Requirements

| Section | Requirement | Status | Evidence / Current state | Notes / Follow-up |
|---|---|---|---|---|
| 6 | Jabber / XMPP client connectivity | `missing` | Not started | Stretch only after base requirements are defensible |
| 6 | Federation between servers | `missing` | Not started | Stretch |
| 6 | Use Jabber library for tech stack | `missing` | Not started | Stretch |
| 6 | Federation load test across two servers | `missing` | Not started | Stretch |
| 6 | Admin UI screens for Jabber dashboard / federation statistics | `missing` | Not started | Stretch |

## 7. Submission Requirement

| Section | Requirement | Status | Evidence / Current state | Notes / Follow-up |
|---|---|---|---|---|
| 7 | Public GitHub repository | `partial` | Repo exists and workflow assumes GitHub | Final submission check still needed |
| 7 | Project buildable/runnable via `docker compose up` from root | `partial` | Current development flow is built around this and repeatedly verified | Sprint 4 still needs clean-clone reviewer-style proof and documentation polish |

## First-Pass Conclusions

Main likely remaining base-spec gaps:

| Gap | Current status | Recommended sprint handling |
|---|---|---|
| Emoji support in messages/composer | `done` | Implemented in Sprint 4 reliability/audit branch |
| Explicit standalone room `Ban` action in admin UI | `done` | Clarified as optional because remove-member => ban is acceptable |
| Wireframe alignment, especially side placement / accordion feel | `partial` | Handle in later UI polish branch |
| Reliability proof for reconnect/stale-tab/unread/presence races | `done` | Broad automated validation completed in the Sprint 4 reliability/audit branch, including active-conversation reconnect recovery |
| Stronger validation / test evidence | `partial` | `SP4-03` |
| Large-history / performance / demo-data proof | `partial` | `SP4-04` |
| Submission-ready documentation / clean-clone proof | `partial` | `SP4-05` |
| XMPP / federation | `missing` | Stretch only after core is solid |
