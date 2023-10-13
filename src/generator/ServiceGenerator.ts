import { Constructor, ObjectMemberMetadata, Service } from "@openhps/core";
import { ProtobufGenerator, ProtobufMessage } from "./ProtobufGenerator";

export class ServiceGenerator extends ProtobufGenerator<Service> {
    
    processObject(object: Constructor<Service>, metaData: ObjectMemberMetadata): Promise<void> {
        throw new Error("Method not implemented.");
    }
    generate(object: Constructor<Service>, metaData: ObjectMemberMetadata): Promise<ProtobufMessage> {
        throw new Error("Method not implemented.");
    }

}
