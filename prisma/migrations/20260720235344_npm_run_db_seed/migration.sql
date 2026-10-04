-- DropForeignKey
ALTER TABLE "IngestionModelResult" DROP CONSTRAINT "IngestionModelResult_ingestionRunId_fkey";

-- DropForeignKey
ALTER TABLE "IngestionModelResult" DROP CONSTRAINT "IngestionModelResult_modelId_fkey";

-- DropForeignKey
ALTER TABLE "MentionTopic" DROP CONSTRAINT "MentionTopic_mentionId_fkey";

-- DropForeignKey
ALTER TABLE "MentionTopic" DROP CONSTRAINT "MentionTopic_topicId_fkey";

-- DropForeignKey
ALTER TABLE "ModelMention" DROP CONSTRAINT "ModelMention_modelId_fkey";

-- DropForeignKey
ALTER TABLE "ModelMention" DROP CONSTRAINT "ModelMention_postId_fkey";

-- AddForeignKey
ALTER TABLE "ModelMention" ADD CONSTRAINT "ModelMention_postId_fkey" FOREIGN KEY ("postId") REFERENCES "XPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelMention" ADD CONSTRAINT "ModelMention_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentionTopic" ADD CONSTRAINT "MentionTopic_mentionId_fkey" FOREIGN KEY ("mentionId") REFERENCES "ModelMention"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentionTopic" ADD CONSTRAINT "MentionTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionModelResult" ADD CONSTRAINT "IngestionModelResult_ingestionRunId_fkey" FOREIGN KEY ("ingestionRunId") REFERENCES "IngestionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionModelResult" ADD CONSTRAINT "IngestionModelResult_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
