# Sprint 3: Social, Governance, and Security

## Sprint Goal

Complete the business rules that make the chat system trustworthy: friends, bans, moderation tools, attachment access control, and destructive lifecycle semantics.

## Scope

### SP3-01 Friendships

- friend list
- send friend request by username
- send friend request from room member list
- optional friend request message
- accept or reject friend request
- remove friend

Acceptance criteria:

- friendship exists only after recipient confirmation
- friend list updates correctly after removal

### SP3-02 User-to-User Bans

- block another user
- terminate friendship when blocked
- prevent new DM initiation in both directions
- freeze existing DM history as read-only

Acceptance criteria:

- blocked users cannot contact the blocker in any way
- existing personal history remains visible but frozen
- DM eligibility enforces friendship plus no-block rule

### SP3-03 Room Administration

- manage room modal
- member list with actions
- add and remove admins
- view banned users
- unban users
- delete room

Acceptance criteria:

- owner is always admin and cannot lose owner privileges
- admins cannot strip owner rights
- owner can remove any admin or member
- moderation actions are reachable through modal-based UI

### SP3-04 Room Bans and Access Consistency

- treat admin removal as ban
- track who banned a user
- prevent banned user from rejoining until unbanned
- revoke room history and attachment access immediately after access loss

Acceptance criteria:

- banned users disappear from active room access
- UI and backend both enforce revoked access
- banned list shows who performed the ban

### SP3-05 Attachments

- upload images and generic files
- upload from button
- upload from paste
- preserve original file name
- optional attachment comment
- render and download attachments in room and DM chats

Acceptance criteria:

- image and file size limits are enforced
- files are stored on local filesystem
- attachment metadata persists correctly

### SP3-06 Attachment Authorization

- serve files through protected backend routes
- enforce room membership and DM participant checks
- enforce access removal after room removal or ban

Acceptance criteria:

- direct file access without authorization is impossible
- users who lost access to a room cannot download its files anymore
- stored files remain intact unless the room is deleted

### SP3-07 Account Deletion

- delete account action
- delete rooms owned by the user
- delete messages and attachments in deleted owned rooms
- remove user membership from other rooms

Acceptance criteria:

- account deletion follows the specification exactly
- owned rooms and their content are removed permanently
- surviving system data remains internally consistent

## Dependencies

- Sprint 2 conversation and membership behavior must already be stable
- attachment authorization depends on finalized conversation access rules
- account deletion depends on room deletion semantics

## Risks

- account deletion and access revocation can easily corrupt data or leak content
- attachment security bugs are high-severity issues

## Exit Criteria

At sprint end, the core feature set from the specification is functionally complete, including social rules, moderation, attachment handling, and destructive account or room behaviors.
