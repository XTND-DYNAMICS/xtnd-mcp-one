/**
 * OpenAPI 3.0 Specification for ChatGPT Custom Actions and REST clients
 */

export function getOpenApiSpec(origin = 'https://one.mcp.xgi.io') {
  return {
    openapi: '3.0.3',
    info: {
      title: 'one.com Mail API (xtnd-mcp-one)',
      version: '0.1.0',
      description: 'Mail management API for one.com mailboxes supporting folders, search, reading, triage, and composition.',
    },
    servers: [{ url: origin }],
    paths: {
      '/api/folders': {
        get: {
          summary: 'List folders',
          operationId: 'listFolders',
          responses: {
            '200': { description: 'List of folders' },
          },
        },
      },
      '/api/emails/search': {
        post: {
          summary: 'Search emails',
          operationId: 'searchEmails',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    folder: { type: 'string', default: 'INBOX' },
                    query: { type: 'string' },
                    unreadOnly: { type: 'boolean' },
                    limit: { type: 'number', default: 20 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Search results' },
          },
        },
      },
      '/api/emails/{uid}': {
        get: {
          summary: 'Get email content',
          operationId: 'getEmailContent',
          parameters: [
            { name: 'uid', in: 'path', required: true, schema: { type: 'integer' } },
            { name: 'folder', in: 'query', schema: { type: 'string', default: 'INBOX' } },
          ],
          responses: {
            '200': { description: 'Email details' },
          },
        },
      },
      '/api/emails/send': {
        post: {
          summary: 'Send email',
          operationId: 'sendEmail',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['to', 'subject', 'bodyText'],
                  properties: {
                    to: { type: 'string' },
                    subject: { type: 'string' },
                    bodyText: { type: 'string' },
                    bodyHtml: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Email sent status' },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
        },
      },
    },
    security: [{ BearerAuth: [] }],
  };
}
