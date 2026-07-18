# Recovered AMF protocol call catalog

This catalog is generated from recovered service wrappers that intersect Smallverse Lab's product boundary. A row proves that the recovered client declares the call shape; it does **not** prove that the current server still accepts it or that Smallverse Lab currently invokes it.

Evidence: **Recovered**. Live availability remains **Unresolved** until a retained request/response confirms it.

Cataloged calls: **324** across **107** recovered service files.

| Remote target | Client wrapper | Result formatter | Relevance | Source |
|---|---|---|---|---|
| activity.admin.getUserActivityLogs | getUserActivityLogs | ActivitySearchResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/activity/ActivityAdminService.as:21 |
| allocation.admin.getAllocationsForSpace | getAllocationsForSpace | SpaceAllocationResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/admin/allocation/AllocationAdminService.as:21 |
| allocation.admin.deleteAllocation | deleteAllocation | SpaceAllocationResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/admin/allocation/AllocationAdminService.as:26 |
| catalog_category.admin.addSpaceCategory | addSpaceCategory | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/catalog/category/CatalogCategoryAdminService.as:22 |
| catalog_category.admin.getItemCategoryTree | getItemCategoryTree | CatalogCategoryResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/catalog/category/CatalogCategoryAdminService.as:27 |
| catalog_category.admin.getManualSpaceCategories | getManualSpaceCategories | CatalogCategoryResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/catalog/category/CatalogCategoryAdminService.as:32 |
| catalog_category.admin.editCategory | editCategory | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/catalog/category/CatalogCategoryAdminService.as:37 |
| catalog_category.admin.deleteCategory | deleteCategory | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/catalog/category/CatalogCategoryAdminService.as:42 |
| catalog_category.admin.getManualItemCategories | getManualItemCategories | CatalogCategoryResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/catalog/category/CatalogCategoryAdminService.as:47 |
| catalog_category.admin.getSpaceCategoryTree | getSpaceCategoryTree | CatalogCategoryResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/catalog/category/CatalogCategoryAdminService.as:52 |
| catalog_category.admin.addItemCategory | addItemCategory | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/catalog/category/CatalogCategoryAdminService.as:57 |
| catalog_category.admin.updateItemCategoryOrder | updateItemCategoryOrder | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/catalog/category/CatalogCategoryAdminService.as:62 |
| catalog_category.admin.updateSpaceCategoryOrder | updateSpaceCategoryOrder | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/catalog/category/CatalogCategoryAdminService.as:67 |
| catalog_category.getActiveSpaceCategoryTree | getActiveSpaceCategoryTree | CatalogCategoryResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/catalog/category/CatalogCategoryService.as:21 |
| catalog_core.admin.getModelCatalogInfo | getModelCatalogInfo | ModelCatalogInfoResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/catalog/core/CatalogAdminService.as:22 |
| catalog_core.admin.getSpaceCatalogInfo | getSpaceCatalogInfo | SpaceCatalogInfoResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/catalog/core/CatalogAdminService.as:27 |
| catalog_entry.admin.getItemEntriesForCategory | getItemEntriesForCategory | ItemEntryResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/catalog/entry/CatalogEntryAdminService.as:25 |
| catalog_entry.admin.deleteInactiveSpaceEntries | deleteInactiveSpaceEntries | IntegerResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/catalog/entry/CatalogEntryAdminService.as:30 |
| catalog_entry.admin.updateEntryOrder | updateEntryOrder | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/catalog/entry/CatalogEntryAdminService.as:35 |
| catalog_entry.admin.deleteEntry | deleteEntry | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/catalog/entry/CatalogEntryAdminService.as:40 |
| catalog_entry.admin.getSpaceEntriesForCategory | getSpaceEntriesForCategory | SpaceEntryResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/catalog/entry/CatalogEntryAdminService.as:45 |
| catalog_entry.admin.manageItemEntries | manageItemEntries | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/catalog/entry/CatalogEntryAdminService.as:53 |
| catalog_entry.admin.deleteInactiveItemEntries | deleteInactiveItemEntries | IntegerResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/catalog/entry/CatalogEntryAdminService.as:58 |
| catalog_entry.admin.manageSpaceEntries | manageSpaceEntries | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/catalog/entry/CatalogEntryAdminService.as:66 |
| catalog_entry.getSpacesForCategory | getSpacesForCategory | SpacePanelItem.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/catalog/entry/CatalogEntryService.as:21 |
| chat.logging.admin.getChannelChatLogs | getChannelChatLogs | RecordSetResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/communication/chat/logging/ChatLoggingAdminService.as:26 |
| chat.logging.admin.getSpaceChatLogs | getSpaceChatLogs | RecordSetResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/communication/chat/logging/ChatLoggingAdminService.as:31 |
| message.admin.viewUsersSentMessages | viewUsersSentMessages | MessageDetailsResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/communication/message/MessageAdminService.as:22 |
| message.admin.viewUsersInbox | viewUsersInbox | MessageDetailsResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/communication/message/MessageAdminService.as:27 |
| message.viewMyAvatarsSentMessages | viewMyAvatarsSentMessages | MessageRecordSetResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/communication/message/MessageService.as:48 |
| message.viewMyAvatarsInbox | viewMyAvatarsInbox | MessageRecordSetResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/communication/message/MessageService.as:68 |
| content.promotion.getPromotionsForUser | getPromotionsForUser | CatalogPanelListResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/content/promotion/PromotionService.as:21 |
| content.scheduling.admin.getCurrentContent | getCurrentContent | ScheduleItemResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/content/scheduling/ContentSchedulingAdminService.as:27 |
| content.scheduling.admin.getUpcomingContent | getUpcomingContent | ScheduleItemResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/content/scheduling/ContentSchedulingAdminService.as:32 |
| avatar.block.isAvatarBlocked | isAvatarBlocked | BooleanResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/block/AvatarBlockService.as:21 |
| avatar.admin.searchAvatars | searchAvatars | AvatarSearchResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/core/AvatarAdminService.as:26 |
| avatar.admin.switchAvatarGender | switchAvatarGender | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/core/AvatarAdminService.as:31 |
| avatar.admin.saveAvatar | saveAvatar | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/core/AvatarAdminService.as:45 |
| avatar.admin.setDefaultAvatar | setDefaultAvatar | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/core/AvatarAdminService.as:50 |
| avatar.admin.findAvatar | findAvatar | FindAvatarResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/core/AvatarAdminService.as:55 |
| avatar.admin.getAvatarDetails | getAvatarDetails | AvatarDetailsResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/core/AvatarAdminService.as:60 |
| avatar.admin.reIndexAvatar | reIndexAvatar | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/core/AvatarAdminService.as:65 |
| avatarcore.getAvatarGender | getAvatarGender | StringResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/core/AvatarCoreService.as:22 |
| avatarcore.getAvatarFoundingMember | getAvatarFoundingMember | BooleanResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/core/AvatarCoreService.as:27 |
| avatarcore.getAvatarVip | getAvatarVip | BooleanResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/core/AvatarCoreService.as:32 |
| group.admin.saveGroupDetails | saveGroupDetails | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/group/core/AvatarGroupAdminService.as:23 |
| group.admin.reIndexGroup | reIndexGroup | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/group/core/AvatarGroupAdminService.as:28 |
| group.admin.getGroupDetails | getGroupDetails | AvatarGroupDetailsResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/group/core/AvatarGroupAdminService.as:33 |
| group.admin.searchGroups | searchGroups | AvatarGroupSearchRecordSetResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/group/core/AvatarGroupAdminService.as:38 |
| outfit.addOutfit | addOutfit | StringResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/outfit/OutfitService.as:23 |
| outfit.getOutfits | getOutfits | OutfitListResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/outfit/OutfitService.as:28 |
| outfit.updateOutfit | updateOutfit | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/outfit/OutfitService.as:33 |
| outfit.deleteOutfit | deleteOutfit | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/outfit/OutfitService.as:38 |
| avatar.profile.core.getAvatarProfile | getAvatarProfile | AvatarProfileResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/profile/core/AvatarProfileService.as:24 |
| avatar.profile.core.saveMyProfileChanges | saveMyProfileChanges | AvatarProfileResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/profile/core/AvatarProfileService.as:52 |
| avatar.profile.core.getMyProfile | getMyProfile | AvatarProfileResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/profile/core/AvatarProfileService.as:57 |
| avatar.profile.datafield.getOrderedDataFields | getOrderedDataFields | DataFieldResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/profile/datafield/AvatarProfileDataFieldService.as:21 |
| avatar.profile.datatext.getOrderedDataTexts | getOrderedDataTexts | DataTextResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/profile/datatexts/AvatarProfileDataTextService.as:21 |
| avatarstats.getOnlineAvatarsCount | getOnlineAvatarsCount | DataResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/stats/AvatarStatsService.as:21 |
| xp.admin.editXPLevel | editXPLevel | NewXPDetailsResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/xp/core/XPAdminService.as:23 |
| xp.admin.findXPLevelsForAvatar | findXPLevelsForAvatar | AvatarXPInfoRecordSetResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/xp/core/XPAdminService.as:28 |
| xp.admin.recalculatePrimaryXP | recalculatePrimaryXP | NewPrimaryXPDetailsResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/xp/core/XPAdminService.as:33 |
| xp.findPrimaryXPByAvatar | findPrimaryXPByAvatar | DataResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/xp/core/XPService.as:22 |
| xp.findSkillsByAvatar | findSkillsByAvatar | AvatarXPListResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/xp/core/XPService.as:27 |
| xp.log.admin.getAvatarXPLog | getAvatarXPLog | AvatarXPLogRecordSetResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/xp/log/XPLogAdminService.as:21 |
| xp.log.viewMyXPLogs | viewMyXPLogs | MyXPLogRecordSetResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/xp/log/XPLogService.as:21 |
| xp.type.getAllXPTypes | getAllXPTypes | XPTypeRecordSet.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/avatar/xp/type/XPTypeService.as:21 |
| catalog.bundle.admin.addBundle | addBundle | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/bundle/CatalogBundleAdminService.as:24 |
| catalog.bundle.admin.editBundle | editBundle | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/bundle/CatalogBundleAdminService.as:30 |
| catalog.bundle.admin.getBundlesForCategory | getBundlesForCategory | BundleResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/bundle/CatalogBundleAdminService.as:35 |
| catalog.bundle.admin.deleteBundle | deleteBundle | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/bundle/CatalogBundleAdminService.as:40 |
| catalog.bundle.getActiveBundlesForCategory | getActiveBundlesForCategory | BundleListResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/bundle/CatalogBundleService.as:22 |
| catalog.bundle.purchaseBundle | purchaseBundle | StringResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/bundle/CatalogBundleService.as:27 |
| catalog.category.admin.deleteCategoryInactives | deleteCategoryInactives | IntegerResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/category/EntityCatalogCategoryAdminService.as:23 |
| catalog.category.admin.getCategories | getCategories | CategoryResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/category/EntityCatalogCategoryAdminService.as:28 |
| catalog.category.admin.updateCategoryItemOrder | updateCategoryItemOrder | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/category/EntityCatalogCategoryAdminService.as:33 |
| catalog.category.admin.updateCategoryOrder | updateCategoryOrder | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/category/EntityCatalogCategoryAdminService.as:38 |
| catalog.category.admin.getAllCategories | getAllCategories | CategoryResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/category/EntityCatalogCategoryAdminService.as:43 |
| catalog.category.admin.editCategory | editCategory | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/category/EntityCatalogCategoryAdminService.as:48 |
| catalog.category.admin.deleteCategory | deleteCategory | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/category/EntityCatalogCategoryAdminService.as:53 |
| catalog.category.admin.adjustDiscounts | adjustDiscounts | IntegerResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/category/EntityCatalogCategoryAdminService.as:58 |
| catalog.category.admin.addCategory | addCategory | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/category/EntityCatalogCategoryAdminService.as:63 |
| catalog.category.getAllActiveCategories | getAllActiveCategories | ActiveCategoryResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/category/EntityCatalogCategoryService.as:21 |
| catalog.admin.importCatalog | importCatalog | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/core/EntityCatalogAdminService.as:22 |
| catalog.admin.exportCatalog | exportCatalog | StringResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/core/EntityCatalogAdminService.as:27 |
| catalog.entry.admin.getEntriesForBundle | getEntriesForBundle | EntryResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/entry/EntityCatalogEntryAdminService.as:23 |
| catalog.entry.admin.editCPEntry | editCPEntry | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/entry/EntityCatalogEntryAdminService.as:28 |
| catalog.entry.admin.addCPEntry | addCPEntry | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/entry/EntityCatalogEntryAdminService.as:33 |
| catalog.entry.admin.updateEntryOrder | updateEntryOrder | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/entry/EntityCatalogEntryAdminService.as:38 |
| catalog.entry.admin.deleteEntry | deleteEntry | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/entry/EntityCatalogEntryAdminService.as:43 |
| catalog.entry.admin.getEntriesForModel | getEntriesForModel | EntryResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/entry/EntityCatalogEntryAdminService.as:48 |
| catalog.entry.admin.manageEntries | manageEntries | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/entry/EntityCatalogEntryAdminService.as:56 |
| catalog.entry.admin.getEntriesForCategory | getEntriesForCategory | EntryResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/entry/EntityCatalogEntryAdminService.as:61 |
| catalog.entry.purchaseEntry | purchaseEntry | EntryPurchaseResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/entry/EntityCatalogEntryService.as:36 |
| catalog.entry.getActiveEntriesForCategory | getActiveEntriesForCategory | ActiveEntryResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/entry/EntityCatalogEntryService.as:41 |
| catalog.entry.getColorOptionForEntry | getColorOptionForEntry | ActiveEntryResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/catalog/entry/EntityCatalogEntryService.as:46 |
| item.admin.removeItemsFromSpace | removeItemsFromSpace | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/item/core/ItemAdminService.as:22 |
| item.admin.saveItemConfig | saveItemConfig | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/item/core/ItemAdminService.as:27 |
| item.admin.fixStackingCount | fixStackingCount | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/item/core/ItemAdminService.as:32 |
| item.admin.searchItems | searchItems | ItemSearchResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/item/core/ItemAdminService.as:37 |
| item.admin.stopSales | stopSales | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/item/core/ItemAdminService.as:42 |
| item.admin.removeItems | removeItems | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/item/core/ItemAdminService.as:47 |
| item.admin.addItems | addItems | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/item/core/ItemAdminService.as:52 |
| item.inventory.getMyInventory | getMyInventory | InventoryItemResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/item/inventory/ItemInventoryService.as:23 |
| item.inventory.getMySpeechBubbles | getMySpeechBubbles | InventoryItemResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/item/inventory/ItemInventoryService.as:28 |
| item.inventory.requestBoomzArrivalUse | requestBoomzArrivalUse | BooleanResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/item/inventory/ItemInventoryService.as:33 |
| item.inventory.hidePlaceholderModel | hidePlaceholderModel | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/item/inventory/ItemInventoryService.as:38 |
| item.inventory.getInventoryItems | getInventoryItems | InventoryItemResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/item/inventory/ItemInventoryService.as:43 |
| item.inventory.hideAllMyPlaceholders | hideAllMyPlaceholders | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/item/inventory/ItemInventoryService.as:48 |
| item.inventory.getMyEmotes | getMyEmotes | InventoryItemResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/item/inventory/ItemInventoryService.as:53 |
| model.admin.getSpaceModels | getSpaceModels | ModelSearchRecordSetResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/model/ModelAdminService.as:21 |
| model.admin.getItemModels | getItemModels | ModelSearchRecordSetResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/model/ModelAdminService.as:26 |
| model.getPricedSpaceModels | getPricedSpaceModels | ModelRecordSetResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/model/ModelService.as:22 |
| model.getMarketPlaceModels | getMarketPlaceModels | ModelListResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/model/ModelService.as:27 |
| model.search.getSearchableItems | getSearchableItems | SearchableModelListResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/model/search/ModelSearchService.as:22 |
| model.search.getAvailabilityInfo | getAvailabilityInfo | ItemAvailabilityResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/model/search/ModelSearchService.as:27 |
| space.alias.admin.saveSpaceAliasDetails | saveSpaceAliasDetails | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/space/alias/SpaceAliasAdminService.as:21 |
| space.clone.admin.cloneSpace | cloneSpace | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/space/clone/SpaceCloneAdminService.as:22 |
| space.clone.admin.importSpace | importSpace | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/space/clone/SpaceCloneAdminService.as:27 |
| space.clone.admin.exportSpace | exportSpace | StringResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/space/clone/SpaceCloneAdminService.as:32 |
| space.admin.getSpaceDetails | getSpaceDetails | SpaceDetailsResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/space/core/SpaceAdminService.as:26 |
| space.admin.searchSpaces | searchSpaces | SpaceSearchResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/space/core/SpaceAdminService.as:31 |
| space.admin.reIndexSpace | reIndexSpace | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/space/core/SpaceAdminService.as:36 |
| space.admin.saveSpaceDetails | saveSpaceDetails | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/space/core/SpaceAdminService.as:42 |
| space.admin.createSpace | createSpace | StringResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/space/core/SpaceAdminService.as:47 |
| space.admin.clearSpaceConfig | clearSpaceConfig | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/space/core/SpaceAdminService.as:52 |
| space.admin.findSpace | findSpace | FindSpaceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/space/core/SpaceAdminService.as:57 |
| spaceevent.createEvent | createEvent | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/space/event/SpaceEventService.as:26 |
| spaceevent.getEventsToBeModerated | getEventsToBeModerated | ModerateSpaceEventRecordSetResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/space/event/SpaceEventService.as:31 |
| spaceevent.getLatestGroupEvents | getLatestGroupEvents | SpaceEventAlertRecordSetResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/space/event/SpaceEventService.as:36 |
| spaceevent.getLatestApprovedEvents | getLatestApprovedEvents | SpaceEventAlertRecordSetResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/space/event/SpaceEventService.as:41 |
| spaceevent.getLatestEvents | getLatestEvents | SpaceEventAlertRecordSetResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/space/event/SpaceEventService.as:46 |
| spaceevent.updateEventStatuses | updateEventStatuses | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/space/event/SpaceEventService.as:51 |
| space.fav.isSpaceFavorite | isSpaceFavorite | BooleanResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/space/fav/SpaceFavService.as:21 |
| space.schedule.admin.saveSpaceSwappingDetails | saveSpaceSwappingDetails | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/space/schedule/SpaceScheduleAdminService.as:21 |
| space.schedule.admin.saveSpaceSchedulingDetails | saveSpaceSchedulingDetails | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/space/schedule/SpaceScheduleAdminService.as:26 |
| space.shop.admin.saveSpaceShopDetails | saveSpaceShopDetails | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/entity/space/shop/SpaceShopAdminService.as:21 |
| invite.admin.getInvitedUserDetails | getInvitedUserDetails | InvitedUserDetailsResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/invite/core/InviteAdminService.as:28 |
| invite.getCurrentInviteInfo | getCurrentInviteInfo | UserInviteInfoResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/invite/core/InviteService.as:34 |
| item.stopAllSales | stopAllSales | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/item/SMIItemService.as:21 |
| widget.itemcrafter.performItemCraft | performItemCraft | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/itemcrafter/ItemCrafterService.as:21 |
| joinTradeTable | joinTradeTable | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/itemtrader/ItemTraderService.as:44 |
| itemtrader.getUniqueTradeId | getUniqueTradeId | StringResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/itemtrader/ItemTraderService.as:49 |
| loyalty.entry.admin.getUserLoyaltyEntries | getUserLoyaltyEntries | UserLoyaltyEntryRecordSetResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/loyalty/entry/LoyaltyEntryAdminService.as:21 |
| market.cancelSellOrder | cancelSellOrder | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/market/MarketService.as:24 |
| market.placeSellOrder | placeSellOrder | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/market/MarketService.as:29 |
| market.quickSell | quickSell | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/market/MarketService.as:34 |
| market.getMySellOrders | getMySellOrders | SellOrderDetailsResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/market/MarketService.as:39 |
| market.purchaseSellOrder | purchaseSellOrder | ItemPurchaseResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/market/MarketService.as:44 |
| market.getSellOrders | getSellOrders | SellOrderDetailsResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/market/MarketService.as:49 |
| market.getMarketValue | getMarketValue | MarketValueResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/market/MarketService.as:54 |
| marketing.affiliate.getMyAffiliateDetails | getMyAffiliateDetails | UserAffiliateResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/marketing/affiliate/AffiliateService.as:21 |
| mission.purchaseMissionRewardItem | purchaseMissionRewardItem | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/mission/core/MissionCoreService.as:21 |
| avatarsubtask.addSubtask | addSubtask | IntegerResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/mission/subtask/AvatarSubtaskService.as:23 |
| avatarsubtask.skipSubtask | skipSubtask | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/mission/subtask/AvatarSubtaskService.as:28 |
| avatarsubtask.getSubtasks | getSubtasks | AvatarSubtaskListResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/mission/subtask/AvatarSubtaskService.as:33 |
| avatarsubtask.updateSubtask | updateSubtask | IntegerResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/mission/subtask/AvatarSubtaskService.as:38 |
| abusereport.category.admin.getAllCategories | getAllCategories | CategoryRecordSet.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/moderation/abusereport/category/AbuseReportCategoryAdminService.as:21 |
| abusereport.category.getCategoriesForType | getCategoriesForType | CategoryListResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/moderation/abusereport/category/AbuseReportCategoryService.as:21 |
| abusereport.admin.resolveReport | resolveReport | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/moderation/abusereport/core/AbuseReportAdminService.as:24 |
| abusereport.admin.searchAbuseReports | searchAbuseReports | AbuseReportSearch.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/moderation/abusereport/core/AbuseReportAdminService.as:29 |
| abusereport.admin.closeReport | closeReport | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/moderation/abusereport/core/AbuseReportAdminService.as:34 |
| abusereport.admin.reassignReport | reassignReport | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/moderation/abusereport/core/AbuseReportAdminService.as:39 |
| abusereport.admin.getUnreadAbuseReportCounts | getUnreadAbuseReportCounts | StringResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/moderation/abusereport/core/AbuseReportAdminService.as:44 |
| abusereport.admin.reactivateReport | reactivateReport | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/moderation/abusereport/core/AbuseReportAdminService.as:49 |
| abusereport.admin.acceptReport | acceptReport | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/moderation/abusereport/core/AbuseReportAdminService.as:54 |
| abusereport.admin.getUserReportDetails | getUserReportDetails | UserReportDetailsResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/moderation/abusereport/core/AbuseReportAdminService.as:59 |
| abusereport.submitReport | submitReport | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/moderation/abusereport/core/AbuseReportService.as:25 |
| infraction.chain.user.admin.getUserChainStatus | getUserChainStatus | UserChainStatusResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/moderation/infraction/chain/user/UserChainAdminService.as:21 |
| infraction.admin.logInfractionAgainstUser | logInfractionAgainstUser | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/moderation/infraction/core/InfractionAdminService.as:24 |
| infraction.admin.replaceUserInfraction | replaceUserInfraction | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/moderation/infraction/core/InfractionAdminService.as:39 |
| infraction.admin.getUserInfractionDetails | getUserInfractionDetails | UserInfractionDetailsResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/moderation/infraction/core/InfractionAdminService.as:49 |
| pet.deletePet | deletePet | StringResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/pet/PetService.as:54 |
| sn.getSNConnections | getSNConnections | UserSNRecordSet.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/sn/SocialNetworkServiceCore.as:19 |
| facebook.connectUser | connectUser | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/sn/facebook/FacebookService.as:32 |
| facebook.disconnectUser | disconnectUser | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/sn/facebook/FacebookService.as:37 |
| usersn.admin.getUserSNConnections | getUserSNConnections | UserSNConnectionResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/sn/user/UserSNAdminService.as:22 |
| usersn.admin.deleteSNConnection | deleteSNConnection | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/sn/user/UserSNAdminService.as:27 |
| space.member.admin.deleteSpaceGroupMember | deleteSpaceGroupMember | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/space/member/SpaceMemberAdminService.as:24 |
| space.member.admin.addSpaceGroupMember | addSpaceGroupMember | StringResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/space/member/SpaceMemberAdminService.as:29 |
| space.member.admin.deleteSpaceMember | deleteSpaceMember | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/space/member/SpaceMemberAdminService.as:34 |
| space.member.admin.editSpaceMember | editSpaceMember | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/space/member/SpaceMemberAdminService.as:39 |
| space.member.admin.checkNewSpaceMember | checkNewSpaceMember | AvatarDetailsResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/space/member/SpaceMemberAdminService.as:44 |
| space.member.admin.checkNewSpaceGroupMember | checkNewSpaceGroupMember | AvatarGroupDetailsResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/space/member/SpaceMemberAdminService.as:49 |
| space.member.admin.editSpaceGroupMember | editSpaceGroupMember | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/space/member/SpaceMemberAdminService.as:54 |
| space.member.admin.addSpaceMember | addSpaceMember | StringResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/space/member/SpaceMemberAdminService.as:59 |
| antifraud.overrideAndPromoteUser | overrideAndPromoteUser | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/antifraud/core/AntiFraudService.as:22 |
| antifraud.getCurrentStatus | getCurrentStatus | AntiFraudStatusResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/antifraud/core/AntiFraudService.as:27 |
| antifraud.removeOverride | removeOverride | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/antifraud/core/AntiFraudService.as:32 |
| antifraud.overrideAndDemoteUser | overrideAndDemoteUser | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/antifraud/core/AntiFraudService.as:37 |
| antifraud.spendlevel.editSpendLevel | editSpendLevel | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/antifraud/spendlevel/SpendLevelService.as:23 |
| antifraud.spendlevel.editDemotionSettings | editDemotionSettings | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/antifraud/spendlevel/SpendLevelService.as:28 |
| antifraud.spendlevel.editBlacklistSettings | editBlacklistSettings | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/antifraud/spendlevel/SpendLevelService.as:33 |
| antifraud.spendlevel.editThrottleSettings | editThrottleSettings | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/antifraud/spendlevel/SpendLevelService.as:38 |
| antifraud.spendlevel.addSpendlevel | addSpendlevel | StringResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/antifraud/spendlevel/SpendLevelService.as:43 |
| antifraud.spendlevel.editPromotionSettings | editPromotionSettings | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/antifraud/spendlevel/SpendLevelService.as:48 |
| antifraud.spendlevel.getSpendLevels | getSpendLevels | SpendLevelSearchRecordSetResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/antifraud/spendlevel/SpendLevelService.as:53 |
| antifraud.userstatus.searchUserSpendLevels | searchUserSpendLevels | UserSpendLevelSearchRecordSetResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/antifraud/userstatus/UserStatusService.as:22 |
| antifraud.userstatus.getUserStatus | getUserStatus | UserStatusResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/antifraud/userstatus/UserStatusService.as:27 |
| bundle.admin.addBundle | addBundle | NewBundleResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/bundle/core/BundleAdminService.as:25 |
| bundle.admin.editBundle | editBundle | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/bundle/core/BundleAdminService.as:30 |
| bundle.admin.updateDisplayOrder | updateDisplayOrder | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/bundle/core/BundleAdminService.as:35 |
| bundle.admin.getSMIBundles | getSMIBundles | BundleSearchResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/bundle/core/BundleAdminService.as:40 |
| bundle.admin.searchBundles | searchBundles | BundleSearchResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/bundle/core/BundleAdminService.as:45 |
| bundle.admin.getBundleDetails | getBundleDetails | BundleDetailsResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/bundle/core/BundleAdminService.as:50 |
| bundle.admin.findBundle | findBundle | FindBundleResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/bundle/core/BundleAdminService.as:55 |
| bundle.admin.deleteBundle | deleteBundle | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/bundle/core/BundleAdminService.as:60 |
| bundle.discount.admin.addBundleDiscount | addBundleDiscount | StringResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/bundle/discount/BundleDiscountAdminService.as:25 |
| bundle.discount.admin.addGlobalDiscount | addGlobalDiscount | NewGlobalDiscountResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/bundle/discount/BundleDiscountAdminService.as:30 |
| bundle.discount.admin.deleteBundleDiscount | deleteBundleDiscount | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/bundle/discount/BundleDiscountAdminService.as:35 |
| bundle.discount.admin.searchGlobalDiscounts | searchGlobalDiscounts | GlobalDiscountSearchResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/bundle/discount/BundleDiscountAdminService.as:40 |
| bundle.discount.admin.getGlobalDiscountDetails | getGlobalDiscountDetails | GlobalDiscountDetailsResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/bundle/discount/BundleDiscountAdminService.as:45 |
| bundle.discount.admin.editBundleDiscount | editBundleDiscount | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/bundle/discount/BundleDiscountAdminService.as:50 |
| bundle.discount.admin.editGlobalDiscount | editGlobalDiscount | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/bundle/discount/BundleDiscountAdminService.as:55 |
| bundle.discount.admin.deleteGlobalDiscount | deleteGlobalDiscount | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/bundle/discount/BundleDiscountAdminService.as:60 |
| bundlereward.addReward | addReward | StringResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/bundle/reward/BundleRewardService.as:22 |
| bundlereward.editReward | editReward | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/bundle/reward/BundleRewardService.as:27 |
| bundlereward.deleteReward | deleteReward | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/bundle/reward/BundleRewardService.as:32 |
| country.getAllCountries | getAllCountries | CountryRecordSetResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/country/CountryService.as:21 |
| payment.admin.retryFailedPayments | retryFailedPayments | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/payment/PaymentAdminService.as:22 |
| payment.admin.removeFailedPayments | removeFailedPayments | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/payment/PaymentAdminService.as:27 |
| payment.admin.overrideFailedPayments | overrideFailedPayments | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/payment/PaymentAdminService.as:32 |
| payment.admin.getPaymentDetails | getPaymentDetails | PaymentCardResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/payment/PaymentAdminService.as:37 |
| storepayment.getMyVisibleOrders | getMyVisibleOrders | MyOrderRecordSetResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/payment/StorePaymentService.as:21 |
| paymentmethod.admin.editIntegration | editIntegration | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/paymentmethod/core/PaymentMethodAdminService.as:24 |
| paymentmethod.admin.getIntegrationDetails | getIntegrationDetails | IntegrationDetailsResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/paymentmethod/core/PaymentMethodAdminService.as:29 |
| paymentmethod.admin.updateDisplayOrder | updateDisplayOrder | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/paymentmethod/core/PaymentMethodAdminService.as:34 |
| paymentmethod.admin.addXSollaIntegration | addXSollaIntegration | NewIntegrationResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/paymentmethod/core/PaymentMethodAdminService.as:39 |
| paymentmethod.admin.searchIntegrations | searchIntegrations | IntegrationSearchResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/paymentmethod/core/PaymentMethodAdminService.as:44 |
| paymentmethod.admin.getAllIntegrations | getAllIntegrations | IntegrationSearchResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/paymentmethod/core/PaymentMethodAdminService.as:49 |
| paymentmethod.admin.deleteXSollaIntegration | deleteXSollaIntegration | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/paymentmethod/core/PaymentMethodAdminService.as:54 |
| zong.admin.recalculatePricePoints | recalculatePricePoints | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/paymentmethod/zong/ZongAdminService.as:22 |
| zong.admin.calculateZongPrices | calculateZongPrices | CountryPriceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/paymentmethod/zong/ZongAdminService.as:27 |
| subscription.admin.getSubscriptionDebugDetails | getSubscriptionDebugDetails | SubscriptionDebugResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/subscription/SubscriptionAdminService.as:24 |
| subscription.admin.addStaffSubscription | addStaffSubscription | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/subscription/SubscriptionAdminService.as:29 |
| subscription.admin.getUserRevenueDetails | getUserRevenueDetails | UserRevenueDetailsResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/subscription/SubscriptionAdminService.as:34 |
| subscription.admin.editSubscription | editSubscription | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/subscription/SubscriptionAdminService.as:39 |
| subscription.admin.fixUserVIPDates | fixUserVIPDates | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/subscription/SubscriptionAdminService.as:44 |
| subscription.admin.removeSubscriptions | removeSubscriptions | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/subscription/SubscriptionAdminService.as:49 |
| subscription.admin.updateSubscriptionDetails | updateSubscriptionDetails | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/subscription/SubscriptionAdminService.as:54 |
| subscription.admin.searchSubscriptions | searchSubscriptions | SubscriptionSearchResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/subscription/SubscriptionAdminService.as:59 |
| subscription.getPurchasedBundlesForUser | getPurchasedBundlesForUser | ListResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/subscription/SubscriptionService.as:22 |
| subscription.getMySubscriptionStatus | getMySubscriptionStatus | SubscriptionStatusResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/store/subscription/SubscriptionService.as:27 |
| transaction.admin.search | search | TransactionSearchResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/transaction/core/TransactionAdminService.as:22 |
| transaction.admin.searchOld | searchOld | TransactionSearchOldRecordSetResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/transaction/core/TransactionAdminService.as:27 |
| transaction.getMyTransactions | getMyTransactions | RecordSetResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/transaction/core/TransactionService.as:21 |
| transaction.stats.admin.getUserBreakdown | getUserBreakdown | UserBreakdownResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/transaction/stats/TransactionStatsAdminService.as:23 |
| transaction.stats.admin.getStatsForPeriod | getStatsForPeriod | DataPointListResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/transaction/stats/TransactionStatsAdminService.as:28 |
| transaction.stats.admin.getStatsEndingAtPeriod | getStatsEndingAtPeriod | DataPointListResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/transaction/stats/TransactionStatsAdminService.as:33 |
| transaction.stats.admin.getTypeList | getTypeList | TypeBreakdownResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/transaction/stats/TransactionStatsAdminService.as:38 |
| transaction.stats.admin.getTypeBreakdown | getTypeBreakdown | TypeBreakdownResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/transaction/stats/TransactionStatsAdminService.as:43 |
| transaction.stats.admin.getStatsStartingAtPeriod | getStatsStartingAtPeriod | DataPointListResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/transaction/stats/TransactionStatsAdminService.as:48 |
| transaction.stats.type.admin.getAllTypes | getAllTypes | TransactionStatsTypeResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/transaction/stats/TransactionStatsTypeAdminService.as:21 |
| transactiontype.getTransactionTypes | getTransactionTypes | TransactionTypeRecordSet.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/transaction/type/TransactionTypeService.as:21 |
| user.auth.authenticator.admin.refreshAuthenticator | refreshAuthenticator | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/auth/authenticator/UserAuthenticatorAdminService.as:21 |
| user.auth.authenticator.admin.attachAuthenticator | attachAuthenticator | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/auth/authenticator/UserAuthenticatorAdminService.as:26 |
| user.auth.authenticator.admin.removeAuthenticator | removeAuthenticator | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/auth/authenticator/UserAuthenticatorAdminService.as:31 |
| user.auth.authenticator.removeUnconfirmedAuthenticator | removeUnconfirmedAuthenticator | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/auth/authenticator/UserAuthenticatorService.as:24 |
| user.auth.authenticator.getMyAuthenticatorStatus | getMyAuthenticatorStatus | AuthenticatorStatusResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/auth/authenticator/UserAuthenticatorService.as:29 |
| user.auth.authenticator.getAvatarAuthenticatorStatus | getAvatarAuthenticatorStatus | BooleanResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/user/auth/authenticator/UserAuthenticatorService.as:34 |
| user.auth.authenticator.completeAttachment | completeAttachment | BooleanResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/auth/authenticator/UserAuthenticatorService.as:39 |
| user.auth.authenticator.attachAuthenticator | attachAuthenticator | NewAuthenticatorResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/auth/authenticator/UserAuthenticatorService.as:44 |
| user.auth.authenticator.removeAuthenticator | removeAuthenticator | BooleanResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/auth/authenticator/UserAuthenticatorService.as:49 |
| user.auth.admin.loginSMI | loginSMI | SMILoginResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/auth/core/UserAuthAdminService.as:21 |
| user.balance.admin.addTokensToUser | addTokensToUser | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/balance/UserBalanceAdminService.as:21 |
| user.balance.admin.removeTokensFromUser | removeTokensFromUser | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/balance/UserBalanceAdminService.as:26 |
| user.balance.admin.addGoldToUser | addGoldToUser | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/balance/UserBalanceAdminService.as:31 |
| user.balance.admin.removeGoldFromUser | removeGoldFromUser | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/balance/UserBalanceAdminService.as:36 |
| user.balance.getMyAccountBalances | getMyAccountBalances | AccountBalanceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/balance/UserBalanceService.as:21 |
| modban.removeActiveBan | removeActiveBan | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/ban/BanService.as:22 |
| user.behaviourflag.admin.getFlagStatusForUser | getFlagStatusForUser | UserFlagStatusResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/behaviourflag/UserBehaviourFlagAdminService.as:22 |
| user.behaviourflag.admin.activateBehaviourFlag | activateBehaviourFlag | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/behaviourflag/UserBehaviourFlagAdminService.as:27 |
| user.behaviourflag.admin.deactivateBehaviourFlag | deactivateBehaviourFlag | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/behaviourflag/UserBehaviourFlagAdminService.as:32 |
| user.change.admin.getUserChangeHistory | getUserChangeHistory | UserChangeResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/change/UserChangeAdminService.as:21 |
| user.admin.searchUsers | searchUsers | UserSearchResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/core/UserAdminService.as:27 |
| user.admin.getUserDetails | getUserDetails | UserDetailsResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/core/UserAdminService.as:32 |
| user.admin.findUser | findUser | FindUserResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/core/UserAdminService.as:37 |
| user.admin.getInfractors | getInfractors | FindUserResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/core/UserAdminService.as:42 |
| user.admin.createUser | createUser | StringResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/core/UserAdminService.as:47 |
| user.admin.saveUserDetails | saveUserDetails | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/core/UserAdminService.as:52 |
| user.admin.getAbuseReportManagers | getAbuseReportManagers | FindUserResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/core/UserAdminService.as:57 |
| user.admin.getEscalators | getEscalators | FindUserResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/core/UserAdminService.as:62 |
| user.admin.getUserSMIDetails | getUserSMIDetails | UserSMIDetailsResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/core/UserAdminService.as:67 |
| user.admin.logoutUser | logoutUser | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/core/UserAdminService.as:72 |
| user.admin.getOnlineStaff | getOnlineStaff | OnlineStaffResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/core/UserAdminService.as:77 |
| user.admin.bootUser | bootUser | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/core/UserAdminService.as:82 |
| cp.log.admin.searchCPLogs | searchCPLogs | CPLogSearchResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/cp/log/CPLogAdminService.as:21 |
| cp.rank.getCPRankInfo | getCPRankInfo | CPRankInfoResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/cp/rank/CPRankService.as:21 |
| cp.theme.getCPThemeInfo | getCPThemeInfo | CPThemeInfoResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/cp/theme/CPThemeService.as:21 |
| cp.user.admin.addCPToUser | addCPToUser | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/cp/user/UserCPAdminService.as:21 |
| cp.user.admin.removeCPFromUser | removeCPFromUser | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/cp/user/UserCPAdminService.as:26 |
| cp.user.getAvatarCPBalance | getAvatarCPBalance | UserCPBalanceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/user/cp/user/UserCPService.as:27 |
| cp.user.getMyCPSettings | getMyCPSettings | UserCPSettingsResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/cp/user/UserCPService.as:32 |
| cp.user.resetCP | resetCP | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/cp/user/UserCPService.as:37 |
| cp.user.saveMyCPSettings | saveMyCPSettings | UserCPSettingsResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/cp/user/UserCPService.as:42 |
| cp.user.spendCP | spendCP | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/cp/user/UserCPService.as:47 |
| cp.user.getMyCPBalance | getMyCPBalance | UserCPBalanceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/cp/user/UserCPService.as:52 |
| cp.user.getAvatarCPSettings | getAvatarCPSettings | UserCPSettingsResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/user/cp/user/UserCPService.as:57 |
| user.group.admin.addGroup | addGroup | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/group/core/GroupAdminService.as:22 |
| user.group.admin.getSystemUserGroups | getSystemUserGroups | UserGroupRecordSet.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/group/core/GroupAdminService.as:27 |
| user.group.admin.getUserGroups | getUserGroups | UserGroupRecordSet.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/group/core/GroupAdminService.as:32 |
| user.group.admin.getCustomUserGroups | getCustomUserGroups | UserGroupRecordSet.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/group/core/GroupAdminService.as:37 |
| user.group.admin.editGroup | editGroup | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/group/core/GroupAdminService.as:42 |
| user.group.admin.getBanUserGroups | getBanUserGroups | UserGroupRecordSet.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/group/core/GroupAdminService.as:47 |
| user.group.admin.deleteGroup | deleteGroup | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/group/core/GroupAdminService.as:52 |
| user.group.admin.getFraudUserGroups | getFraudUserGroups | UserGroupRecordSet.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/group/core/GroupAdminService.as:57 |
| user.group.user.admin.updateAdditionalGroups | updateAdditionalGroups | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/group/user/UserGroupAdminService.as:21 |
| user.group.user.admin.updatePrimaryGroup | updatePrimaryGroup | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/group/user/UserGroupAdminService.as:26 |
| user.ip.admin.searchUserIPs | searchUserIPs | UserIPSearchResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/ip/UserIPAdminService.as:21 |
| user.notes.admin.saveUserNotes | saveUserNotes | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/notes/UserNotesAdminService.as:21 |
| permission.admin.getPermissionsForUserGroup | getPermissionsForUserGroup | PermissionRecordSet.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/permission/PermissionAdminService.as:23 |
| permission.admin.getProductPermissions | getProductPermissions | PermissionRecordSet.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/permission/PermissionAdminService.as:28 |
| permission.admin.savePermissions | savePermissions | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/permission/PermissionAdminService.as:33 |
| user.secretquestion.admin.getSecretQuestions | getSecretQuestions | SecretQuestionResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/secretquestion/SecretQuestionAdminService.as:21 |
| user.settings.saveMySocialSettings | saveMySocialSettings | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/settings/UserSettingsService.as:21 |
| user.settings.saveMyEmailSettings | saveMyEmailSettings | ServiceResult.format | support | recovered-swfs/main-source/scripts/com/smallworlds/service/user/settings/UserSettingsService.as:26 |
| spintowin.category.admin.getCategories | getCategories | CategorySearchRecordSetResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/widget/spintowin/category/SpinCategoryAdminService.as:23 |
| spintowin.category.admin.editCategory | editCategory | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/widget/spintowin/category/SpinCategoryAdminService.as:28 |
| spintowin.category.admin.deleteCategory | deleteCategory | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/widget/spintowin/category/SpinCategoryAdminService.as:33 |
| spintowin.category.admin.addCategory | addCategory | DataResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/widget/spintowin/category/SpinCategoryAdminService.as:38 |
| spintowin.prize.admin.getPrizesForCategory | getPrizesForCategory | PrizeSearchRecordSetResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/widget/spintowin/prize/SpinPrizeAdminService.as:23 |
| spintowin.prize.admin.addPrize | addPrize | StringResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/widget/spintowin/prize/SpinPrizeAdminService.as:28 |
| spintowin.prize.admin.deletePrize | deletePrize | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/widget/spintowin/prize/SpinPrizeAdminService.as:33 |
| spintowin.prize.admin.editPrize | editPrize | ServiceResult.format | direct | recovered-swfs/main-source/scripts/com/smallworlds/service/widget/spintowin/prize/SpinPrizeAdminService.as:38 |

## Interpretation rules

- direct means the service belongs to identity, avatars, spaces, items, catalogs, markets, transactions, snapshots, or the Spin/wheel boundary.
- support means the call contributes authentication, settings, channel state, owner/user context, or store context needed by a direct flow.
- inline/none visible means the one-line wrapper does not expose a named result formatter. The callback and result class must be inspected before implementing a decoder.
- Admin and mutation methods appearing here are protocol evidence, not authorization for Smallverse Lab to invoke them.
- A recovered method name is never sufficient to invent request arguments. Wrapper signatures and a successful capture must agree.

## Critical general and multiline calls

The generated catalog above covers the common `DataEndpoint.call(...)` and `SpaceEndpoint.call(...)` shape. The recovered client also formats central calls across multiple lines or specialized endpoint variables. These calls are authoritative for Beacon even though their source shape differs.

### Identity and avatar discovery

| Remote method | Result contract | Beacon meaning | Source |
|---|---|---|---|
| `friend.searchForFriends` | `FriendListResult.format` | Two-letter search resolves human avatar names, exact avatar IDs and server-generated portrait URLs. Across five supplied transactions, all 4,085 rows have `Person.avatar`, all `Person.user` values are null, and this call supplies no owner edge in those captures. | `recovered-swfs/main-source/scripts/com/smallworlds/service/friend/FriendService.as:32` |
| `avatarcore.getUsersAvatars` | `UserAvatarListResult.format` | Authoritative owner/account to all avatar slots edge. | `recovered-swfs/main-source/scripts/com/smallworlds/service/avatar/fl/AvatarService.as:29` |
| `avatarcore.getCurrentAvatar` | `SelectedAvatarResult.format` | Account's currently selected/default avatar when exposed by the server. | `recovered-swfs/main-source/scripts/com/smallworlds/service/avatar/fl/AvatarService.as:43` |
| `avatar.makeDefaultAvatar` | `ServiceResult.format` | Proves the platform has an explicit default-avatar concept; Beacon must not infer it from array order. | `recovered-swfs/main-source/scripts/com/smallworlds/service/avatar/fl/AvatarService.as:48` |
| `avatar.getCurrentAvatar` | `SelectedAvatarResult.format` | Main-service current-avatar lookup. | `recovered-swfs/main-source/scripts/com/smallworlds/service/avatar/AvatarService.as:159` |
| `avatar.viewMyAvatars` | `ViewAvatarsResult.format` | Signed-in account's avatar collection. | `recovered-swfs/main-source/scripts/com/smallworlds/service/avatar/AvatarService.as:280` |
| `avatar.viewAvatars` | `ViewAvatarsResult.format` | Avatar records for an explicitly supplied owner/user. | `recovered-swfs/main-source/scripts/com/smallworlds/service/avatar/AvatarService.as:303` |
| `avatar.getAvatarStatus` | `AvatarStatusResult.format` | Avatar state/presence metadata. | `recovered-swfs/main-source/scripts/com/smallworlds/service/avatar/AvatarService.as:203` |
| `avatar.getAvatarOnlineVisible` | `AvatarOnlineVisibleResult.format` | Online-visibility state without changing identity. | `recovered-swfs/main-source/scripts/com/smallworlds/service/avatar/AvatarService.as:120` |
| `avatar.saveAvatarSnapshot` | `SaveSnapshotResult.format` | Official platform avatar snapshot pipeline. | `recovered-swfs/main-source/scripts/com/smallworlds/service/avatar/AvatarService.as:170` |
| `avatar.updateAvatarConfig` | `ServiceResult.format` | Confirms live appearance is a server-side configuration payload and renderer input, not a portrait substitute. | `recovered-swfs/main-source/scripts/com/smallworlds/service/avatar/AvatarService.as:388` |
| `avatar.getPurchasedOptions` | `PurchasedOptionsResult.format` | Configuration choices available to an avatar. | `recovered-swfs/main-source/scripts/com/smallworlds/service/avatar/AvatarService.as:460` |

### Popular spaces, location identity, and room contents

The recovered client exposes two Popular-capable paths. `space.viewPopSpaces` is a direct Popular service. A separately retained historical game exchange proves that a client surface also used `catalog_entry.getSpacesForCategory(category, offset, count)` and received `SpacePanelItem` rows. That retained response was ordered by `currentVisitors` descending and carried canonical space names and image sources. Current path selection and ordering still require a fresh response.

| Remote method | Result contract | Beacon meaning | Source |
|---|---|---|---|
| `space.viewPopSpaces` | `ViewPopularSpacesResult.format` | Direct recovered Popular Spaces request; one of two proven Popular-capable paths and not a guessed HTTP slug. | `recovered-swfs/main-source/scripts/com/smallworlds/service/space/SpaceService.as:702` |
| `ls.lookupSpace` | `LookupSpaceResult.format` | Resolves a space identifier/address to live space metadata. | `recovered-swfs/main-source/scripts/com/smallworlds/service/space/SpaceService.as:682` |
| `ls.lookupChannel` | `LookupChannelResult.format` | Resolves the channel used to enter/observe a room. | `recovered-swfs/main-source/scripts/com/smallworlds/service/channel/ChannelService.as:167` |
| `space.getSpaceInfo` | `SpaceInfoResult.format` | Canonical name, owner, snapshot and metadata for a space ID. | `recovered-swfs/main-source/scripts/com/smallworlds/service/space/fl/SpaceService.as:149` |
| `space.getSpaceAddress` | `SpaceAddressResult.format` | Navigation address associated with a space. | `recovered-swfs/main-source/scripts/com/smallworlds/service/space/fl/SpaceService.as:78` |
| `space.getSpaceIdFromAlias` | `SpaceIdResult.format` | Human alias to canonical space ID. | `recovered-swfs/main-source/scripts/com/smallworlds/service/space/fl/SpaceService.as:144` |
| `space.getSpaceInfoFromAlias` | `SpaceInfoResult.format` | Canonical space metadata from an alias. | `recovered-swfs/main-source/scripts/com/smallworlds/service/space/fl/SpaceService.as:124` |
| `space.viewSpaceItems` | `ViewSpaceItemsResult.format` | Room-associated items; placed, listed and observed evidence must remain distinct. | `recovered-swfs/main-source/scripts/com/smallworlds/service/space/SpaceService.as:802` |
| `space.viewSpacesIOwn` | `ViewSpacesResult.format` | Verified owner-scoped spaces, not generic presence. | `recovered-swfs/main-source/scripts/com/smallworlds/service/space/SpaceService.as:697` |
| `space.viewFeaturedSpaces` | `ViewSpacesResult.format` | Separate curated surface, not Popular Spaces. | `recovered-swfs/main-source/scripts/com/smallworlds/service/space/SpaceService.as:142` |
| `space.searchSpaces` | `ViewSpacesResult.format` | Human query path for names and imagery missing from raw observations. | `recovered-swfs/main-source/scripts/com/smallworlds/service/space/SpaceService.as:869` |
| `space.searchSpacesAdv` | `ViewSpacesResult.format` | Advanced space resolution/search path. | `recovered-swfs/main-source/scripts/com/smallworlds/service/space/SpaceService.as:573` |
| `space.saveSpaceSnapshot` | `SaveSnapshotResult.format` | Explicit platform space snapshot/image pipeline. | `recovered-swfs/main-source/scripts/com/smallworlds/service/space/SpaceService.as:558` |
| `avatar.getAvatarHomeSpaceInfo` | `SpaceInfoResult.format` | Avatar home space with canonical metadata. | `recovered-swfs/main-source/scripts/com/smallworlds/service/space/fl/SpaceService.as:83` |
| `avatar.getAvatarHomeSpaceId` | `SpaceIdResult.format` | Avatar to home-space identifier. | `recovered-swfs/main-source/scripts/com/smallworlds/service/space/fl/SpaceService.as:139` |

### Item definitions, UID configuration, and icons

| Remote method | Result contract | Beacon meaning | Source |
|---|---|---|---|
| `item.getModels` | `ItemModelListResult.format` | Base item model definitions. | `recovered-swfs/main-source/scripts/com/smallworlds/service/item/fl/ItemService.as:50` |
| `item.getMyItems` | `ItemListResult.format` | Account-owned instances; ownership must remain distinct from room observation. | `recovered-swfs/main-source/scripts/com/smallworlds/service/item/fl/ItemService.as:55` |
| `item.saveItemConfig` | `ServiceResult.format` | A unique instance can carry configuration distinct from its base model. | `recovered-swfs/main-source/scripts/com/smallworlds/service/item/fl/ItemService.as:90` |
| `item.getModelSource` | `ItemModelSourceResult.format` | Model source used to interpret/configure an item. | `recovered-swfs/main-source/scripts/com/smallworlds/service/item/fl/ItemService.as:95` |
| `item.saveItemIcon` | `SaveItemIconResult.format` | Persists the configured UID's rendered icon; direct variant-icon evidence. | `recovered-swfs/main-source/scripts/com/smallworlds/service/item/fl/ItemService.as:108` |
| `item.isItemInCatalog` | `ItemInCatalogResult.format` | Catalog membership, independent of XML rarity and observation. | `recovered-swfs/main-source/scripts/com/smallworlds/service/item/ItemService.as:131` |

Canonical flow: `Popular result -> space/channel lookup -> live room events -> owner/avatar/item UIDs -> identity and space resolvers -> configuration evidence -> renderer assets`.

These calls do not make every raw observation public-ready. See [DATA-LINEAGE-AND-JOINS.md](DATA-LINEAGE-AND-JOINS.md) for join and publication rules.

## SpinToWin multiline wrappers

The generated table above targets the common one-line `_dataEndpoint.call(...)` wrapper shape. `SpinToWinService` uses multiline `dataEndpoint.call(...)` closures, so its stateful public calls are recorded explicitly here.

| Remote target | Wrapper | Formatter | State updated by recovered client | Source |
|---|---|---|---|---|
| `spintowin.getFreePrize` | `getFreePrize` | `FreePrizeResult.format` | free cooldown | `recovered-swfs/main-source/scripts/com/smallworlds/service/widget/spintowin/core/SpinToWinService.as:45` |
| `spintowin.getDeluxeSpinsRemaining` | `getDeluxeSpinsRemaining` | `IntegerResult.format` | deluxe spins remaining | `recovered-swfs/main-source/scripts/com/smallworlds/service/widget/spintowin/core/SpinToWinService.as:61` |
| `spintowin.getSpinPrices` | `getSpinPrices` | `ListResult.format` | callback result only | `recovered-swfs/main-source/scripts/com/smallworlds/service/widget/spintowin/core/SpinToWinService.as:79` |
| `spintowin.getFreeWheelCooldown` | `getFreeWheelCooldown` | `IntegerResult.format` | cooldown and local synchronization time | `recovered-swfs/main-source/scripts/com/smallworlds/service/widget/spintowin/core/SpinToWinService.as:84` |
| `spintowin.getDeluxePrize` | `getDeluxePrize` | `DeluxePrizeResult.format` | deluxe spins remaining | `recovered-swfs/main-source/scripts/com/smallworlds/service/widget/spintowin/core/SpinToWinService.as:100` |
| `spintowin.getInitState` | `getInitState` | `InitStateResult.format` | cooldown, prizes, remaining spins, winners, server time | `recovered-swfs/main-source/scripts/com/smallworlds/service/widget/spintowin/core/SpinToWinService.as:121` |
| `spintowin.purchaseDeluxeSpins` | `purchaseDeluxeSpins` | `IntegerResult.format` | deluxe spins remaining | `recovered-swfs/main-source/scripts/com/smallworlds/service/widget/spintowin/core/SpinToWinService.as:145` |
| `spintowin.processDeluxeWin` | `processDeluxeWin` | `RecentWinnersResult.format` | recent-winner list/event | `recovered-swfs/main-source/scripts/com/smallworlds/service/widget/spintowin/core/SpinToWinService.as:164` |

The recovered UI call sequence is `getInitState` when opening the panel, `getFreePrize` for the free wheel, `getDeluxePrize` followed by `processDeluxeWin` for the deluxe wheel, and `getSpinPrices` plus `purchaseDeluxeSpins` for purchasing spins. See `recovered-swfs/main-source/scripts/com/smallworlds/spin/ui/FreeWheel.as`, `DeluxeWheel.as`, `PurchaseSpinsPanel.as`, and `player/dockPanels/shop/SpinToWinPanel.as`.

Historical VPS action/receipt files preserve successful `getInitState`, `getSpinPrices`, `getDeluxePrize`, and `purchaseDeluxeSpins` activity. That upgrades Spin from implemented-only to captured-historical, while current personal-session behavior remains unverified in this read-only audit.

The broader HAR dump also captures `transaction.getMyTransactions(searchText, startIndex, pageSize)`. Its returned columns are `usertrans_timestamp`, `usertrans_details`, `usertrans_gold`, and `usertrans_tokens`; filtered historical rows describe free/Deluxe Spin wins and Deluxe Spin purchases. This is a receipt/query boundary, not authorization to infer an idempotent action API from display text.

The supplied historical SAZ corpus additionally captures typed `spintowin.getInitState`, `spintowin.getSpinPrices`, and a successful `spintowin.getFreePrize` response. It confirms the free-spin mutation/cooldown boundary; it does not prove current availability or make repeated invocation safe.

## Zoltar boundary

The supplied item response resolves the launch chain:

```text
Zoltar's Trading Cards (model 9383)
  -> items/base/antique/a_widget_02_cardtrade.xml
  -> widgets/widget_card_dispenser_rsrs.swf
  -> widgets/assets/card_dispenser/control_ui.mxml
  -> HTTPS iframe route widget/zoltar?widget=true
```

The referenced SWF was hashed and decompiled read-only. It is a generic URL-iframe bridge: it reads `widget_iframe_file` and emits `OPEN_WIDGET_IFRAME`; it contains no Zoltar purchase/transmute business call. The PCAP proves only the widget `Collection._USERS_` RTMP registration. Historical `transaction.getMyTransactions` responses add filtered receipt descriptions for Zoltar card-pack purchases and prove the four-column transaction-history schema. They do not expose the iframe mutation, card-grant payload, idempotency behavior, or a direct action-to-grant identifier. Those remain **Unresolved** and require a sanitized browser HAR/Fiddler action capture.

## Supplied historical capture verification

The archive described in [Old captures evidence report](./OLD-CAPTURES-EVIDENCE-REPORT.md) contains 437 successfully decoded AMF requests across `auction.saz`, `svtest2.saz`, and `tranquil.saz`, with zero decoder failures. Captured typed boundaries include:

- `ds.getLoggedInUser` returning user/account ID, current avatar ID, home space ID, and account state;
- `avatar.chooseAvatar` returning avatar ID/name, compressed full configuration, and portrait postfixes;
- `ls.lookupSpace` returning space/owner IDs plus live host, channel, instance and visitors;
- `space.getSpaceInfo` returning canonical space identity, owner, config/model, snapshot and thumbnail;
- `space.viewMembers` returning avatar ID/name/online/role/space columns;
- `avatar.viewMyAvatars` returning avatar rows including `avatar_owner_id`;
- `widget.content.getContentForItem` returning creator/owner avatar/user IDs and content paths;
- `market.getSellOrders` once, as a read boundary only.

No supplied auction capture contains `placeSellOrder`, `purchaseSellOrder`, or `cancelSellOrder`. The auction files therefore prove observed room sale fields and a market read, not a completed marketplace mutation. The store PCAPs are HTTPS without decryption secrets and do not reveal an order body or item-grant response.
