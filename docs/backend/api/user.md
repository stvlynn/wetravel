# User profile, preferences, and avatar

Unless noted, success body is `{ "data": … }` and the tables describe the **payload inside `data`**.

## Account profile

Profile reads and display-name updates use Better Auth directly rather than
duplicate OpenTrip routes:

- `GET /api/auth/get-session` returns the current user profile.
- `POST /api/auth/update-user` with `{ "name": "…" }` trims the name and
  accepts 1–64 characters.

Name and image changes made through Better Auth are synchronized to every
`trip_members` row backed by that user and emit a `members` realtime
invalidation for each affected trip.

## User preferences and avatar

### `GET /api/users/preferences`

- **Auth:** session  
- **Response:** [`UserPreferenceDto`](./dtos.md#userpreferencedto)

### `PUT /api/users/preferences`

- **Auth:** session  
- **Body:**

| Field | Type | Rules |
| --- | --- | --- |
| `plannerSidebarWidth` | number | 0…100 |
| `plannerSidebarCollapsed` | boolean | |

- **Response:** [`UserPreferenceDto`](./dtos.md#userpreferencedto)

### `PUT /api/users/preferences/agent-panel`

- **Auth:** session  
- **Body:** `{ collapsed: boolean }`  
- **Response:** [`UserPreferenceDto`](./dtos.md#userpreferencedto)

### `POST /api/users/avatar`

- **Auth:** session  
- **Status:** `201`  
- **Body:** `multipart/form-data`, field name **`avatar`**  
- **Constraints:** PNG / JPEG / WebP; max **2 MiB**  
- **Response:** `{ url: string }`  
- **Errors:** `400` `avatar_missing` / `avatar_unsupported_mime`; `413`
  `avatar_too_large`

The object is stored first, then the Better Auth user image is updated. The
same user-update hook synchronizes trip member avatars. If account/profile
projection update fails, the previous image is restored and the new object is
removed.

### `DELETE /api/users/avatar`

- **Auth:** session  
- **Response:** `{ image: null }`

---

[← API index](./README.md) · [Route index](./routes.md) · [DTOs](./dtos.md)
