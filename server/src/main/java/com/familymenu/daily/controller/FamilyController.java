package com.familymenu.daily.controller;

import com.familymenu.daily.auth.CurrentUser;
import com.familymenu.daily.auth.RequiresAuth;
import com.familymenu.daily.dto.ApiModels.AddFamilyMemberRequest;
import com.familymenu.daily.dto.ApiModels.CreateFamilyRequest;
import com.familymenu.daily.dto.ApiModels.FamilyJoinPreview;
import com.familymenu.daily.dto.ApiModels.FamilyMemberItem;
import com.familymenu.daily.dto.ApiModels.FamilyProfile;
import com.familymenu.daily.dto.ApiModels.JoinFamilyRequest;
import com.familymenu.daily.dto.ApiModels.UpdateMemberAvoidRequest;
import com.familymenu.daily.dto.AuthModels.AuthUser;
import com.familymenu.daily.service.FamilyService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/family")
public class FamilyController {

    private final FamilyService familyService;

    public FamilyController(FamilyService familyService) {
        this.familyService = familyService;
    }

    @GetMapping("/profile")
    public FamilyProfile profile(@CurrentUser(orGuest = true) AuthUser user) {
        return familyService.getProfile(user.familyId());
    }

    @PostMapping
    public FamilyProfile create(@CurrentUser(orGuest = true) AuthUser user,
                                @Valid @RequestBody CreateFamilyRequest request) {
        return familyService.createFamily(user.userId(), user.familyId(), request);
    }

    @GetMapping("/join-preview")
    public FamilyJoinPreview joinPreview(@RequestParam("inviteCode") String inviteCode) {
        return familyService.previewJoin(inviteCode);
    }

    @PostMapping("/join")
    public FamilyProfile join(@CurrentUser(orGuest = true) AuthUser user,
                              @Valid @RequestBody JoinFamilyRequest request) {
        return familyService.joinFamily(user.userId(), request);
    }

    @GetMapping("/invite-code")
    public FamilyJoinPreview inviteCode(@CurrentUser(orGuest = true) AuthUser user) {
        FamilyProfile profile = familyService.getProfile(user.familyId());
        return new FamilyJoinPreview(familyService.inviteCode(user.familyId()), profile.familyName(), profile.members().size());
    }

    @PostMapping("/members")
    @RequiresAuth
    public FamilyMemberItem addMember(@CurrentUser AuthUser user,
                                      @Valid @RequestBody AddFamilyMemberRequest request) {
        return familyService.addMember(user.familyId(), user.userId(), request);
    }

    @PutMapping("/members/{userId}/avoid")
    @RequiresAuth
    public FamilyMemberItem updateMemberAvoid(@CurrentUser AuthUser user,
                                              @PathVariable("userId") long targetUserId,
                                              @RequestBody(required = false) UpdateMemberAvoidRequest request) {
        List<String> avoidTags = request == null ? null : request.avoidTags();
        return familyService.updateMemberAvoidTags(user.familyId(), user.userId(), targetUserId, avoidTags);
    }

    @DeleteMapping("/members/{userId}")
    @RequiresAuth
    public FamilyProfile removeMember(@CurrentUser AuthUser user,
                                       @PathVariable("userId") long targetUserId) {
        familyService.removeMember(user.familyId(), user.userId(), targetUserId);
        return familyService.getProfile(user.familyId());
    }
}
