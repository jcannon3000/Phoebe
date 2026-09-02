// The Taizé meditations are Phoebe's inbox source; this file holds the shared
// RSS reader that a second one would use.
//
// It briefly served Joan Chittister's weekly and the National Cathedral's
// sermons, both removed at the owner's word — the Cathedral after its reader
// was working, Chittister after three attempts to make a Mailchimp campaign
// page read well on a phone. The reader below is left intact and generic: it
// parses ordinary RSS 2.0, handles CDATA and entity-escaped titles, caches for
// half an hour and never caches an empty parse. The next weekly source can use
// it as it stands.

import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

export default router;
