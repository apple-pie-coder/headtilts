import { PrismaClient } from '@prisma/client';
import { DEFAULT_ROLES, PERMISSIONS } from '@headtilts/shared';

const prisma = new PrismaClient();

async function seed() {
  try {
    console.log('🌱 Seeding database...');

    // Create permissions
    const permissionMap: Record<string, { id: number }> = {};
    for (const [, permName] of Object.entries(PERMISSIONS)) {
      const [module, action] = permName.split('_');
      const permission = await prisma.permission.upsert({
        where: { module_action: { module, action } },
        update: {},
        create: { module, action },
      });
      permissionMap[permName] = permission;
    }
    console.log(`✓ Created ${Object.keys(permissionMap).length} permissions`);

    // Create default roles with permissions
    for (const [, roleConfig] of Object.entries(DEFAULT_ROLES)) {
      const role = await prisma.role.upsert({
        where: { name: roleConfig.name },
        update: {},
        create: {
          name: roleConfig.name,
          description: roleConfig.description,
          isSystem: true,
        },
      });

      // Assign permissions to role
      for (const permName of roleConfig.permissions) {
        const permission = permissionMap[permName];
        if (permission) {
          await prisma.rolePermission.upsert({
            where: {
              roleId_permissionId: {
                roleId: role.id,
                permissionId: permission.id,
              },
            },
            update: {},
            create: {
              roleId: role.id,
              permissionId: permission.id,
            },
          });
        }
      }
    }
    console.log(`✓ Created ${Object.keys(DEFAULT_ROLES).length} default roles`);

    // Create default settings — update: {} so re-running never overwrites user-edited values
    const settings = [
      // General
      { key: 'site_title', value: 'Headtilts CMS', type: 'string' },
      { key: 'site_tagline', value: 'Powered by Node.js', type: 'string' },
      { key: 'show_tagline', value: 'yes', type: 'string' },
      { key: 'site_logo', value: '', type: 'string' },
      { key: 'site_description', value: 'A WordPress-like CMS built with Node.js and React', type: 'string' },
      { key: 'admin_email', value: 'admin@example.com', type: 'string' },
      { key: 'timezone', value: 'UTC', type: 'string' },
      { key: 'date_format', value: 'F j, Y', type: 'string' },
      { key: 'time_format', value: 'g:i a', type: 'string' },
      { key: 'week_starts_on', value: '0', type: 'string' },
      // Reading
      { key: 'front_page_display', value: 'posts', type: 'string' },
      { key: 'front_page_id', value: '', type: 'string' },
      { key: 'posts_page_id', value: '', type: 'string' },
      { key: 'contact_page_id', value: '', type: 'string' },
      { key: 'about_page_id', value: '', type: 'string' },
      { key: 'posts_per_page', value: '10', type: 'number' },
      { key: 'posts_per_rss', value: '10', type: 'number' },
      { key: 'rss_content', value: 'excerpt', type: 'string' },
      { key: 'search_engine_visibility', value: 'yes', type: 'string' },
      // Discussion
      { key: 'default_comment_status', value: 'open', type: 'string' },
      { key: 'require_name_email_for_comments', value: 'yes', type: 'string' },
      { key: 'close_comments_days', value: '0', type: 'number' },
      { key: 'moderate_first_comment', value: 'yes', type: 'string' },
      { key: 'comment_moderation', value: 'no', type: 'string' },
      { key: 'comment_notify_author', value: 'yes', type: 'string' },
      { key: 'comment_notify_moderation', value: 'yes', type: 'string' },
      { key: 'show_avatars', value: 'yes', type: 'string' },
      { key: 'default_avatar', value: 'mystery', type: 'string' },
      { key: 'avatar_rating', value: 'G', type: 'string' },
      // Media
      { key: 'thumbnail_size_w', value: '150', type: 'number' },
      { key: 'thumbnail_size_h', value: '150', type: 'number' },
      { key: 'thumbnail_crop', value: 'yes', type: 'string' },
      { key: 'medium_size_w', value: '300', type: 'number' },
      { key: 'medium_size_h', value: '300', type: 'number' },
      { key: 'large_size_w', value: '1024', type: 'number' },
      { key: 'large_size_h', value: '1024', type: 'number' },
      { key: 'uploads_use_yearmonth', value: 'yes', type: 'string' },
      { key: 'upload_allowed_mime', value: 'image/jpeg,image/png,image/gif,image/webp', type: 'string' },
      { key: 'max_upload_size', value: '10', type: 'number' },
      { key: 'media_format', value: 'original', type: 'string' },
      { key: 'media_quality', value: '82', type: 'number' },
      // Permalinks
      { key: 'permalink_structure', value: '/%postname%/', type: 'string' },
    ];

    for (const setting of settings) {
      await prisma.setting.upsert({
        where: { key: setting.key },
        update: {},
        create: setting,
      });
    }
    console.log(`✓ Ensured ${settings.length} default settings`);

    // Create default widget zones
    const widgetZones = [
      { name: 'sidebar', description: 'Main sidebar', maxWidgets: 10 },
      { name: 'footer-1', description: 'Footer column 1', maxWidgets: 5 },
      { name: 'footer-2', description: 'Footer column 2', maxWidgets: 5 },
      { name: 'footer-3', description: 'Footer column 3', maxWidgets: 5 },
      { name: 'footer-bottom', description: 'Footer bottom bar — legal links (Privacy, Terms, etc.)', maxWidgets: 3 },
      { name: 'front-page-featured', description: 'Featured sections shown on the static front page', maxWidgets: 6 },
    ];
    for (const zone of widgetZones) {
      await prisma.widgetZone.upsert({
        where: { name: zone.name },
        update: {},
        create: zone,
      });
    }
    console.log(`✓ Ensured ${widgetZones.length} default widget zones`);

    // Configure the front-page-featured zone with per-category "View all" grids.
    // The FrontPageHero already covers latest/featured posts at the top of the page,
    // so drop the older "Featured Stories"/"Trending Now" defaults if present.
    const featuredZone = await prisma.widgetZone.findUnique({
      where: { name: 'front-page-featured' },
      include: { widgets: { include: { widget: true } } },
    });

    if (featuredZone) {
      const obsoleteNames = ['Front Page — Featured Stories', 'Front Page — Trending Now'];
      for (const zww of featuredZone.widgets) {
        if (obsoleteNames.includes(zww.widget.name)) {
          await prisma.widgetZoneWidget.delete({ where: { id: zww.id } });
        }
      }

      const remaining = featuredZone.widgets.filter((zww) => !obsoleteNames.includes(zww.widget.name));
      const assignedIds = new Set(remaining.map((zww) => zww.widgetId));
      let nextPosition = remaining.length;

      const categories = await prisma.category.findMany({
        where: { name: { in: ['News', 'Reviews', 'Editorials', 'Interviews'] } },
        select: { name: true, slug: true },
      });

      for (const category of categories) {
        const widgetName = `Front Page — ${category.name} Grid`;
        const widget = await prisma.widget.upsert({
          where: { name: widgetName },
          update: {},
          create: { name: widgetName, type: 'category-posts-grid', title: category.name, isActive: true },
        });
        await prisma.widgetSetting.upsert({
          where: { widgetId_key: { widgetId: widget.id, key: 'config' } },
          update: {},
          create: { widgetId: widget.id, key: 'config', value: JSON.stringify({ categorySlug: category.slug, count: 4 }), type: 'json' },
        });
        if (!assignedIds.has(widget.id) && nextPosition < featuredZone.maxWidgets) {
          await prisma.widgetZoneWidget.create({ data: { zoneId: featuredZone.id, widgetId: widget.id, position: nextPosition } });
          assignedIds.add(widget.id);
          nextPosition++;
        }
      }
      console.log(`✓ Configured "front-page-featured" zone with category sections`);
    }

    console.log('✓ Database seeding completed!');
  } catch (error) {
    console.error('✗ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
